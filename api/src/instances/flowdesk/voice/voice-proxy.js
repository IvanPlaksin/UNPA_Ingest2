'use strict';

/**
 * Voice Live server-side WebSocket proxy (Phase 2).
 *
 * Browser ⇄ our backend (this relay) ⇄ Azure Voice Live. The permanent Foundry
 * key stays on the server (it only ever appears in the upstream URL built by
 * voice-config.buildUpstreamUrl); the browser authenticates to the relay with a
 * short-lived, single-use ticket minted by POST /flowdesk/voice/token, because a
 * browser WebSocket upgrade cannot carry custom auth headers.
 *
 * A single `upgrade` router on the shared HTTP server dispatches by path so this
 * relay coexists with the existing `/ws` service without either aborting the
 * other's handshakes (two `{ server, path }` WebSocket.Servers would).
 *
 * @module instances/flowdesk/voice/voice-proxy
 */

const WebSocket = require('ws');
const redis = require('../../../services/redis.service');
const voiceConfig = require('./voice-config');

const PROXY_PATH = '/api/v1/flowdesk/voice/proxy';   // absolute path the upgrade router matches
const PROXY_SUFFIX = '/flowdesk/voice/proxy';        // relative to apiBaseUrl (/api/v1) — reverse-proxy safe
const TICKET_KEY = (t) => `voice:ticket:${t}`;
const TICKET_TTL_SECONDS = 60;

/**
 * Mint a single-use proxy ticket bound to a session/user. Called by the token
 * endpoint for the proxy transport. Returns the ticket string.
 */
async function mintTicket(sessionId, userId) {
  // Random, unguessable ticket. Node crypto is available in this runtime.
  const ticket = require('crypto').randomBytes(24).toString('hex');
  await redis.set(TICKET_KEY(ticket), { sessionId, userId, createdAt: new Date().toISOString() }, TICKET_TTL_SECONDS);
  return ticket;
}

/** Validate + consume a ticket (single use). Returns {sessionId,userId} or null. */
async function consumeTicket(ticket) {
  if (!ticket) return null;
  const rec = await redis.get(TICKET_KEY(ticket));
  if (!rec) return null;
  await redis.del(TICKET_KEY(ticket)); // single use
  return rec;
}

function parseUrl(reqUrl) {
  // reqUrl is a path+query like /api/v1/flowdesk/voice/proxy?sessionId=..&ticket=..
  const u = new URL(reqUrl, 'http://localhost');
  return { pathname: u.pathname, params: u.searchParams };
}

/**
 * One browser⇄Azure relay. Frames are passed through verbatim in both
 * directions; backpressure is respected via bufferedAmount, and either side
 * closing tears down the pair.
 */
class VoiceProxySession {
  constructor(clientWs, ctx) {
    this.clientWs = clientWs;
    this.ctx = ctx; // { sessionId, userId }
    this.upstreamWs = null;
    this.closed = false;
  }

  connect() {
    let upstreamUrl;
    try {
      upstreamUrl = voiceConfig.buildUpstreamUrl(); // contains the server-side key
    } catch (err) {
      this._fail(`upstream config error: ${err.message}`);
      return;
    }

    this.upstreamWs = new WebSocket(upstreamUrl, [voiceConfig.VOICE_WS_SUBPROTOCOL]);

    this.upstreamWs.on('open', () => {
      // Relay client → Azure
      this.clientWs.on('message', (data, isBinary) => this._relay(this.upstreamWs, data, isBinary));
      // Relay Azure → client
      this.upstreamWs.on('message', (data, isBinary) => this._relay(this.clientWs, data, isBinary));
    });

    // Coordinated teardown
    const closeBoth = (who) => (code, reason) => {
      if (this.closed) return;
      this.closed = true;
      const safeCode = code >= 1000 && code <= 4999 ? code : 1011;
      try { this.clientWs.close(safeCode); } catch (_) {}
      try { this.upstreamWs.close(safeCode); } catch (_) {}
      console.log(`[voice-proxy] session ${this.ctx.sessionId} closed by ${who} (${code})`);
    };
    this.clientWs.on('close', closeBoth('client'));
    this.upstreamWs.on('close', closeBoth('upstream'));

    this.upstreamWs.on('error', (err) => this._fail(`upstream error: ${err.message}`));
    this.upstreamWs.on('unexpected-response', (_req, res) =>
      this._fail(`upstream upgrade HTTP ${res.statusCode}`));
    this.clientWs.on('error', (err) => this._fail(`client error: ${err.message}`));
  }

  _relay(target, data, isBinary) {
    if (!target || target.readyState !== WebSocket.OPEN) return;
    // Simple backpressure guard: if the target is congested, drop the source's
    // socket into paused mode until it drains. For control frames (JSON) this is
    // rarely hit; for audio it prevents unbounded buffering.
    target.send(data, { binary: isBinary }, (err) => {
      if (err) this._fail(`send error: ${err.message}`);
    });
    if (target.bufferedAmount > 1 << 20) { // >1 MiB queued
      const source = target === this.upstreamWs ? this.clientWs : this.upstreamWs;
      try { source.pause(); } catch (_) {}
      const resume = () => { if (target.bufferedAmount < 1 << 18) { try { source.resume(); } catch (_) {} } };
      setTimeout(resume, 20);
    }
  }

  _fail(msg) {
    if (this.closed) return;
    this.closed = true;
    console.error(`[voice-proxy] session ${this.ctx?.sessionId}: ${msg}`);
    try { this.clientWs.close(1011, 'proxy error'); } catch (_) {}
    try { this.upstreamWs && this.upstreamWs.close(1011, 'proxy error'); } catch (_) {}
  }
}

/**
 * Install the voice proxy on the shared HTTP server. Re-routes the `upgrade`
 * event so `/ws` still reaches the existing service and PROXY_PATH reaches this
 * relay; every other path is rejected.
 *
 * @param {http.Server} server
 * @param {WebSocket.Server} [existingWss] the /ws server (from websocketService.wss)
 */
function initVoiceProxy(server, existingWss) {
  const voiceWss = new WebSocket.Server({ noServer: true });

  voiceWss.on('connection', (clientWs, req) => {
    const ctx = req._voiceCtx || {};
    console.log(`[voice-proxy] client connected: session=${ctx.sessionId} user=${(ctx.userId || '').slice(0, 8)}`);
    // Decoupled orchestrator (Phase 2''): Azure STT/TTS with the FlowDesk
    // interpreter as the brain — voice obeys the same dialogue rules as text.
    try {
      const { VoiceOrchestratorSession, getSpeechCreds } = require('./voice-orchestrator');
      new VoiceOrchestratorSession(clientWs, ctx, getSpeechCreds()).start();
    } catch (err) {
      console.error(`[voice-proxy] orchestrator start failed: ${err.message}`);
      try { clientWs.close(1011, 'voice init failed'); } catch (_) {}
    }
  });

  // Take over upgrade routing. The existing service attached its own listener via
  // `{ server }`; remove it and dispatch centrally so paths don't abort each other.
  const existingPath = existingWss && existingWss.options ? existingWss.options.path : '/ws';
  server.removeAllListeners('upgrade');

  server.on('upgrade', async (req, socket, head) => {
    let pathname;
    try { ({ pathname } = parseUrl(req.url)); }
    catch { socket.destroy(); return; }

    if (pathname === PROXY_PATH) {
      // Authenticate the browser with its single-use ticket before upgrading.
      let params;
      try { ({ params } = parseUrl(req.url)); } catch { socket.destroy(); return; }
      const ticket = params.get('ticket');
      const sessionId = params.get('sessionId');
      const ctx = await consumeTicket(ticket);
      if (!ctx || (sessionId && ctx.sessionId !== sessionId)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      // Selected UI language (2-letter code) → the orchestrator uses it for STT,
      // interpretation and TTS, so the agent never auto-switches languages.
      const lang = params.get('lang');
      if (lang) ctx.lang = lang;
      // CS-2: the user-selected AI voice (Azure Neural name) → orchestrator TTS.
      const voice = params.get('voice');
      if (voice) ctx.voice = voice;
      voiceWss.handleUpgrade(req, socket, head, (ws) => {
        req._voiceCtx = ctx;
        voiceWss.emit('connection', ws, req);
      });
      return;
    }

    if (existingWss && pathname === existingPath) {
      existingWss.handleUpgrade(req, socket, head, (ws) => {
        existingWss.emit('connection', ws, req);
      });
      return;
    }

    socket.destroy();
  });

  console.log(`[voice-proxy] initialized on ${PROXY_PATH} (upstream model=${voiceConfig.getActiveModelKey()})`);
  return voiceWss;
}

module.exports = { initVoiceProxy, mintTicket, consumeTicket, PROXY_PATH, PROXY_SUFFIX };
