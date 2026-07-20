'use strict';
/**
 * Full pipeline test: Upload → Classify → Extract → Verify
 * Document: ST/SGB/2007/6 – Information Classification Policy
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'http://localhost:3010';
const PDF_PATH = path.resolve(__dirname, '../../Artefacts/Documents/UN_IT_Regulations/Secretariat/ST_SGB_2007_6_Information_Classification.pdf');
const STAGES   = [];

function log(stage, status, detail = '') {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${stage}: ${status}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  STAGES.push({ stage, status, detail, ts });
}

function apiRequest(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search };
    if (opts.headers) options.headers = opts.headers;
    const req = http.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function uploadFile(filePath, metadata) {
  return new Promise((resolve, reject) => {
    const boundary = 'BOUNDARY_' + Date.now();
    const fileContent = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    let body = '';
    // Form fields
    for (const [k, v] of Object.entries(metadata)) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    }
    // File part header
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
    const fileFooter = `\r\n--${boundary}--\r\n`;
    const totalBuf = Buffer.concat([
      Buffer.from(body),
      Buffer.from(fileHeader),
      fileContent,
      Buffer.from(fileFooter),
    ]);
    const options = {
      method: 'POST', hostname: 'localhost', port: 3010,
      path: '/api/v1/documents/upload',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalBuf.length,
      },
    };
    const req = http.request(options, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch { resolve(out); } });
    });
    req.on('error', reject);
    req.write(totalBuf);
    req.end();
  });
}

async function pollStatus(docId, targetStatuses, maxWaitSec = 120, intervalSec = 4) {
  const deadline = Date.now() + maxWaitSec * 1000;
  while (Date.now() < deadline) {
    const { data } = await apiRequest('GET', `/api/v1/documents?limit=100`);
    const doc = (data.data || []).find(d => d.id === docId);
    if (!doc) { await new Promise(r => setTimeout(r, intervalSec * 1000)); continue; }
    if (targetStatuses.includes(doc.status)) return doc;
    await new Promise(r => setTimeout(r, intervalSec * 1000));
  }
  return null;
}

async function pollExtraction(docId, maxWaitSec = 360, intervalSec = 8) {
  const deadline = Date.now() + maxWaitSec * 1000;
  while (Date.now() < deadline) {
    try {
      const { data } = await apiRequest('GET', `/api/v1/documents/${docId}/extraction/progress`);
      if (data?.data?.status === 'completed' || data?.data?.status === 'failed') return data.data;
      if (data?.data?.overallProgress > 0) {
        const step = data.data.currentStep || 'running';
        process.stdout.write(`\r  Extraction progress: ${data.data.overallProgress}% [${step}]   `);
      }
    } catch {}
    await new Promise(r => setTimeout(r, intervalSec * 1000));
  }
  return null;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('FULL PIPELINE TEST — ST/SGB/2007/6');
  console.log('='.repeat(60) + '\n');

  // ── STAGE 1: UPLOAD ───────────────────────────────────────
  log('UPLOAD', 'starting', path.basename(PDF_PATH));
  if (!fs.existsSync(PDF_PATH)) {
    log('UPLOAD', 'FAIL', 'File not found: ' + PDF_PATH);
    process.exit(1);
  }
  const fileSize = fs.statSync(PDF_PATH).size;

  const uploadResult = await uploadFile(PDF_PATH, {
    namespace:     'UN',
    documentTitle: "Secretary-General's Bulletin: Information and Communications Technology Security",
    unSymbol:      'ST/SGB/2007/6',
    publishedDate: '2007-02-20',
  });

  if (!uploadResult?.success) {
    log('UPLOAD', 'FAIL', JSON.stringify(uploadResult));
    process.exit(1);
  }
  const docId = uploadResult.data?.documentId;
  log('UPLOAD', 'OK', `docId=${docId} fileSize=${fileSize}B`);

  // ── STAGE 2: AUTO-CLASSIFY ────────────────────────────────
  log('CLASSIFY', 'waiting for auto-classification...');
  const classified = await pollStatus(docId, ['CLASSIFIED', 'NEEDS_REVIEW', 'FAILED'], 90, 4);
  if (!classified) {
    log('CLASSIFY', 'TIMEOUT', 'document did not reach CLASSIFIED within 90s');
    process.exit(1);
  }
  log('CLASSIFY', classified.status === 'CLASSIFIED' ? 'OK' : 'NEEDS_REVIEW',
    `type=${classified.documentType} layer=${classified.epistemicLayer} conf=${classified.classificationConfidence}`);

  // ── STAGE 3: TRIGGER EXTRACTION ──────────────────────────
  log('EXTRACT_TRIGGER', 'starting extraction');
  const extractResp = await apiRequest('POST', `/api/v1/documents/${docId}/extract`,
    { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-code' }) });
  if (!extractResp.data?.success) {
    log('EXTRACT_TRIGGER', 'FAIL', JSON.stringify(extractResp.data));
    process.exit(1);
  }
  const jobId = extractResp.data?.data?.jobId;
  log('EXTRACT_TRIGGER', 'OK', `jobId=${jobId}`);

  // ── STAGE 4: MONITOR EXTRACTION ──────────────────────────
  log('EXTRACT_PROGRESS', 'monitoring...');
  const progress = await pollExtraction(docId, 420, 8);
  console.log(); // newline after progress
  if (!progress) {
    log('EXTRACT_PROGRESS', 'TIMEOUT', 'extraction did not complete within 7 minutes');
    process.exit(1);
  }
  const summary = progress.summary || {};
  log('EXTRACT_PROGRESS', progress.status === 'completed' ? 'OK' : 'FAIL',
    `entities=${summary.entitiesExtracted || '?'} vectors=${summary.vectorsIndexed || '?'} duration=${progress.duration || '?'}ms`);

  // ── STAGE 5: VERIFY IN MEMGRAPH ──────────────────────────
  log('VERIFY_GRAPH', 'checking Memgraph state...');
  const mg = require('../src/services/memgraph.service');

  const [docRow] = await mg.runQuery(
    'MATCH (d:Document {id: $id}) RETURN d.status AS status, d.documentType AS dtype, d.epistemicLayer AS layer, d.extractedAt AS extractedAt, d.kqsScore AS kqs',
    { id: docId }
  );
  const [erRow] = await mg.runQuery(
    `MATCH (d:Document {id: $id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
     RETURN r.id AS id, r.methodologyId AS methId, r.entitiesExtracted AS ents,
            r.vectorsIndexed AS vecs, r.extractionJobId AS jobId
     ORDER BY r.completedAt DESC LIMIT 1`,
    { id: docId }
  );
  const [methRow] = erRow?.methId ? await mg.runQuery(
    'MATCH (m:Methodology {id: $id}) RETURN m.name AS name', { id: erRow.methId }
  ) : [null];
  const emCount = await mg.runQuery(
    'MATCH (d:Document {id: $id})-[:MENTIONS]->(em:EntityMention) RETURN count(em) AS cnt', { id: docId }
  );
  const emCnt = typeof emCount[0]?.cnt === 'object' ? (emCount[0].cnt?.low ?? 0) : (emCount[0]?.cnt || 0);

  log('VERIFY_GRAPH', docRow ? 'OK' : 'FAIL',
    `status=${docRow?.status} type=${docRow?.dtype} layer=${docRow?.layer}`);
  log('VERIFY_EXTRACTION_RESULT', erRow ? 'OK' : 'FAIL',
    `methodology=${methRow?.name || erRow?.methId} entities=${erRow?.ents} vectors=${erRow?.vecs}`);
  log('VERIFY_ENTITIES', emCnt > 0 ? 'OK' : 'FAIL', `EntityMentions in graph: ${emCnt}`);

  // ── STAGE 6: VERIFY IN QDRANT ─────────────────────────────
  log('VERIFY_QDRANT', 'checking vectors...');
  try {
    const qdrant = require('../src/services/qdrant.service');
    const client = qdrant.client || qdrant;
    // Use exact count API — scroll(limit:N) truncates and gives wrong number
    const countResult = await client.count('documents_entities', {
      filter: { must: [{ key: 'sourceDocumentId', match: { value: docId } }] },
      exact: true,
    });
    const vecCount = countResult?.count ?? 0;
    // Spot-check one point for vector dimensionality
    const sample = await client.scroll('documents_entities', {
      filter: { must: [{ key: 'sourceDocumentId', match: { value: docId } }] },
      limit: 1, with_payload: true, with_vector: true,
    });
    const pt = (sample?.points || sample || [])[0];
    const dim = Array.isArray(pt?.vector) ? pt.vector.length : '?';
    const model = pt?.payload?.embeddingModel || '?';
    log('VERIFY_QDRANT', vecCount > 0 ? 'OK' : 'WARN',
      `${vecCount} vectors in documents_entities (${dim}-dim, model=${model})`);
  } catch (e) {
    log('VERIFY_QDRANT', 'WARN', e.message);
  }

  // ── STAGE 7: CHECK FRONTEND VISIBILITY ───────────────────
  log('FRONTEND_VISIBILITY', 'verifying document appears in /documents API...');
  const { data: listData } = await apiRequest('GET', `/api/v1/documents?limit=100`);
  const found = (listData.data || []).find(d => d.id === docId);
  log('FRONTEND_VISIBILITY', found ? 'OK' : 'FAIL',
    found ? `Visible at http://localhost:5173/documents (status=${found.status}, type=${found.documentType})` : 'Document not found in list API');

  // ── FINAL REPORT ─────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE TEST REPORT — ' + new Date().toISOString().slice(0, 19));
  console.log('='.repeat(60));
  console.log(`Document: ST/SGB/2007/6`);
  console.log(`Document ID: ${docId}`);
  console.log(`Frontend URL: http://localhost:5173/documents`);
  console.log('');
  const padded = (s, n) => String(s).padEnd(n);
  console.log(padded('Stage', 28) + padded('Status', 14) + 'Detail');
  console.log('-'.repeat(80));
  for (const s of STAGES) {
    const icon = s.status.includes('FAIL') || s.status === 'TIMEOUT' ? '❌' :
                 s.status === 'WARN' ? '⚠️ ' :
                 s.status === 'NEEDS_REVIEW' ? '⚠️ ' : '✅';
    console.log(`${icon} ${padded(s.stage, 26)} ${padded(s.status, 14)} ${s.detail}`);
  }
  const passes = STAGES.filter(s => !s.status.includes('FAIL') && s.status !== 'TIMEOUT').length;
  console.log('\n' + `TOTAL: ${passes}/${STAGES.length} stages OK`);

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
