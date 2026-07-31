'use strict';

/**
 * HYB-FIX-001/002/004 — which interpreter actually serves a conversation.
 *
 * This file exists because of a failure that no test could have caught, and that is
 * the thing it is built to fix. The hybrid interpreter was designed, implemented,
 * tested, and MEASURED — 3410 ms → 1436 ms per turn, 22 of 27 turns answered without
 * the model — and then never enabled anywhere outside a test process. Every real
 * conversation went through the model for every click, for weeks, while the tests
 * stayed green and the measurements stayed true.
 *
 * The tests were green because they set the environment variable themselves. That is
 * the trap: a suite that configures the thing it is testing can only ever prove the
 * mechanism works, never that anyone is using it. So the last block here reads the
 * REAL configuration file rather than a fixture.
 */

const path = require('path');
const fs = require('fs');

const svc = require('../chat-v2.service');

const SAVED = {};
const KEYS = ['FLOWDESK_INTERPRETER', 'FLOWDESK_HYBRID_INTERPRETER', 'FLOWDESK_AGENT_INTERPRETER'];

beforeEach(() => {
  for (const k of KEYS) { SAVED[k] = process.env[k]; delete process.env[k]; }
  process.env.FLOWDESK_AGENT_INTERPRETER = '1';
});
afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k];
  }
});

describe('the default, which is the whole point', () => {
  test('with the agent on and nothing else said, the interpreter is HYBRID', () => {
    // Previously: agent. The opt-in was never taken, so the measured cheap path
    // served nobody and the expensive one served everybody.
    expect(svc.interpreterMode()).toEqual({
      mode: 'hybrid', source: 'default (FLOWDESK_INTERPRETER not set)',
    });
    expect(svc.hybridEnabled()).toBe(true);
  });

  test('the expensive path now requires saying so out loud', () => {
    process.env.FLOWDESK_INTERPRETER = 'agent';
    expect(svc.interpreterMode().mode).toBe('agent');
    expect(svc.hybridEnabled()).toBe(false);
  });

  test('an explicit hybrid is still honoured, and says where it came from', () => {
    process.env.FLOWDESK_INTERPRETER = 'hybrid';
    expect(svc.interpreterMode().source).toBe('FLOWDESK_INTERPRETER=hybrid');
  });

  test('the legacy switch keeps working for anyone who set it', () => {
    process.env.FLOWDESK_HYBRID_INTERPRETER = '1';
    expect(svc.interpreterMode().mode).toBe('hybrid');
  });

  test('without the agent there is no hybrid to default to — it CONTAINS the agent', () => {
    delete process.env.FLOWDESK_AGENT_INTERPRETER;
    expect(svc.interpreterMode().mode).toBe('fsm');
  });

  test('an unrecognised value does not silently become the expensive path', () => {
    process.env.FLOWDESK_INTERPRETER = 'Hybrid ';
    expect(svc.interpreterMode().mode).toBe('hybrid');
    process.env.FLOWDESK_INTERPRETER = 'nonsense';
    // Falls through to the default rather than to `agent`.
    expect(svc.interpreterMode().mode).toBe('hybrid');
  });
});

describe('the process says what it is doing', () => {
  const lines = () => { const out = []; svc.announceInterpreter((l) => out.push(l)); return out; };

  test('names the mode and where it came from', () => {
    svc._resetAnnounce?.();
    const out = lines();
    expect(out.join('\n')).toMatch(/Interpreter mode: HYBRID/);
    expect(out.join('\n')).toMatch(/source: default/);
  });

  test('warns plainly when every turn will call the model', () => {
    // For weeks the only way to learn this was to read three files and evaluate two
    // expressions by hand.
    svc._resetAnnounce?.();
    process.env.FLOWDESK_INTERPRETER = 'agent';
    expect(lines().join('\n')).toMatch(/WARNING: hybrid disabled — EVERY turn calls the model/);
  });
});

/**
 * HYB-FIX-004 — the guard that would have caught this.
 *
 * It reads the real `.env`, not a fixture. A test that writes the configuration it
 * then asserts on proves only that the reader works; the question here is whether the
 * DEPLOYED configuration leaves the assistant on the expensive path.
 */
describe('the configuration this repository would actually run', () => {
  const envPath = path.resolve(__dirname, '../../../../../.env');
  const readEnv = () => {
    if (!fs.existsSync(envPath)) return null;
    const out = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  };

  test('does not put the assistant on the model-for-every-turn path', () => {
    const env = readEnv();
    if (!env) return; // no .env in this checkout — nothing to assert about
    const explicit = String(env.FLOWDESK_INTERPRETER || '').toLowerCase();
    // Absent is now correct (hybrid is the default). `agent` is a deliberate,
    // expensive choice and must not be made by accident.
    expect(explicit === '' || explicit === 'hybrid').toBe(true);
  });

  test('the agent interpreter is on, or the hybrid has nothing to default to', () => {
    const env = readEnv();
    if (!env) return;
    expect(String(env.FLOWDESK_AGENT_INTERPRETER || '')).toBe('1');
  });
});
