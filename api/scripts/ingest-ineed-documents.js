'use strict';
/**
 * Ingest UN iNeed-related documents with provenance metadata.
 *
 * Run from api/ directory:
 *   node scripts/ingest-ineed-documents.js
 *
 * For documents marked downloadUrl: null, download manually from sourceUrl
 * and place the file in tmp/ineed-downloads/ with the given filename,
 * then re-run this script.
 *
 * Verified PDF download URLs as of 2026-06-01:
 *   ODS (documents-dds-ny.un.org): A/69/517, A/RES/69/262 — direct PDF ✓
 *   OIOS: tokens expire — download manually from oios.un.org
 *   JIU:  download manually from unjiu.org
 *   Policy Portal: download manually from policy.un.org
 */

const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const FormData = require('form-data');

const API_BASE = process.env.API_BASE || 'http://localhost:3010';

// ─── Document Manifest ────────────────────────────────────────────────────────

const DOCUMENTS = [
  {
    unSymbol:         'A/69/517',
    documentTitle:    'Report of the Secretary-General on the iNeed digital portal for UN staff',
    sourceRepository: 'ODS',
    sourceUrl:        'https://docs.un.org/en/A/69/517',
    publishedDate:    '2014-09-29',
    downloadUrl:      'https://documents.un.org/doc/undoc/gen/n14/565/39/pdf/n1456539.pdf',
    filename:         'A_69_517_iNeed_SG_Report.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'A/RES/69/262',
    documentTitle:    'General Assembly Resolution 69/262 — Umoja enterprise resource planning and iNeed',
    sourceRepository: 'ODS',
    sourceUrl:        'https://docs.un.org/en/A/RES/69/262',
    publishedDate:    '2014-12-26',
    downloadUrl:      'https://documents.un.org/doc/undoc/gen/n14/720/75/pdf/n1472075.pdf',
    filename:         'A_RES_69_262.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'A/77/489',
    documentTitle:    'Progress report on the digital transformation of the UN Secretariat',
    sourceRepository: 'ODS',
    sourceUrl:        'https://docs.un.org/en/A/77/489',
    publishedDate:    '2022-10-07',
    downloadUrl:      'https://documents.un.org/doc/undoc/gen/n22/608/05/pdf/n2260805.pdf',
    filename:         'A_77_489_Digital_Transformation.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'OIOS/2021/040',
    documentTitle:    'Audit of the iNeed HR service delivery platform',
    sourceRepository: 'OIOS',
    sourceUrl:        'https://oios.un.org/file/9107/download',
    publishedDate:    '2021-06-01',
    // MANUAL: OIOS download tokens expire — obtain fresh link from oios.un.org search
    downloadUrl:      null,
    filename:         'OIOS_2021_040_iNeed_Audit.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'OIOS/2023/030',
    documentTitle:    'Follow-up audit of the iNeed HR service delivery platform',
    sourceRepository: 'OIOS',
    sourceUrl:        'https://oios.un.org/file/9927/download',
    publishedDate:    '2023-05-01',
    // MANUAL: OIOS download tokens expire — obtain fresh link from oios.un.org search
    downloadUrl:      null,
    filename:         'OIOS_2023_030_iNeed_Followup.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'OIOS/2019/119',
    documentTitle:    'Audit of human resources information systems — Umoja/iNeed transition',
    sourceRepository: 'OIOS',
    sourceUrl:        'https://oios.un.org/file/8381/download',
    publishedDate:    '2019-12-01',
    // MANUAL: OIOS download tokens expire — obtain fresh link from oios.un.org search
    downloadUrl:      null,
    filename:         'OIOS_2019_119_HR_Systems.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'JIU/REP/2012/8',
    documentTitle:    'Review of enterprise resource planning in the UN system — Umoja and iNeed',
    sourceRepository: 'JIU',
    sourceUrl:        'https://www.unjiu.org/en/reports-notes/jiu-products/rep/2012',
    publishedDate:    '2012-01-01',
    // MANUAL: download from unjiu.org and save as filename below
    downloadUrl:      null,
    filename:         'JIU_REP_2012_8_ERP_Review.pdf',
    namespace:        'INEED',
  },
  {
    unSymbol:         'ST/SGB/2023/1',
    documentTitle:    "Secretary-General's bulletin on the use of information and communication technology resources",
    sourceRepository: 'POLICY_PORTAL',
    sourceUrl:        'https://policy.un.org/policy-documents/stsgsm',
    publishedDate:    '2023-01-01',
    // MANUAL: download from policy.un.org and save as filename below
    downloadUrl:      null,
    filename:         'ST_SGB_2023_1.pdf',
    namespace:        'INEED',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);
    const req = proto.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UN-UNPA-Ingest/1.0' }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return resolve(downloadFile(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const ct = res.headers['content-type'] || '';
      if (!ct.includes('pdf') && !ct.includes('octet-stream')) {
        res.resume();
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Not a PDF (Content-Type: ${ct})`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });
    req.on('error', err => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    req.setTimeout(30000, () => req.destroy(new Error(`Timeout`)));
  });
}

function uploadDocument(filePath, doc) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename: doc.filename });
    form.append('namespace',        doc.namespace);
    if (doc.sourceUrl)        form.append('sourceUrl',        doc.sourceUrl);
    if (doc.sourceRepository)  form.append('sourceRepository', doc.sourceRepository);
    if (doc.unSymbol)          form.append('unSymbol',         doc.unSymbol);
    if (doc.documentTitle)     form.append('documentTitle',    doc.documentTitle);
    if (doc.publishedDate)     form.append('publishedDate',    doc.publishedDate);

    const options = {
      method: 'POST',
      host:   'localhost',
      port:   3010,
      path:   '/api/v1/documents/upload',
      headers: form.getHeaders(),
    };

    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.success) reject(new Error(json.error || 'Upload failed'));
          else resolve(json.data);
        } catch (e) { reject(new Error(`Bad response: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const tmpDir = path.join(__dirname, '..', '..', 'tmp', 'ineed-downloads');
  fs.mkdirSync(tmpDir, { recursive: true });

  const results = [];

  for (const doc of DOCUMENTS) {
    console.log(`\n[${'='.repeat(60)}]`);
    console.log(`  ${doc.unSymbol} — ${doc.documentTitle.slice(0, 60)}`);

    const tmpFile = path.join(tmpDir, doc.filename);

    // If no downloadUrl, check for manually-placed file
    if (!doc.downloadUrl) {
      if (fs.existsSync(tmpFile)) {
        console.log(`  ✓ Manual file found: ${tmpFile}`);
      } else {
        console.log(`  ⚠  MANUAL DOWNLOAD REQUIRED`);
        console.log(`     Download from: ${doc.sourceUrl}`);
        console.log(`     Save as: ${tmpFile}`);
        results.push({ unSymbol: doc.unSymbol, status: 'MANUAL_REQUIRED', sourceUrl: doc.sourceUrl });
        continue;
      }
    } else {
      try {
        console.log(`  ↓ Downloading...`);
        await downloadFile(doc.downloadUrl, tmpFile);
        const stat = fs.statSync(tmpFile);
        console.log(`  ✓ Downloaded ${(stat.size / 1024).toFixed(1)} KB`);
      } catch (e) {
        console.error(`  ✗ Download failed: ${e.message}`);
        results.push({ unSymbol: doc.unSymbol, status: 'DOWNLOAD_FAILED', error: e.message });
        continue;
      }
    }

    try {
      console.log(`  ↑ Uploading...`);
      const result = await uploadDocument(tmpFile, doc);
      console.log(`  ✓ documentId: ${result.documentId}, status: ${result.status}`);
      results.push({ unSymbol: doc.unSymbol, documentId: result.documentId, status: 'UPLOADED' });
    } catch (e) {
      console.error(`  ✗ Upload failed: ${e.message}`);
      results.push({ unSymbol: doc.unSymbol, status: 'UPLOAD_FAILED', error: e.message });
    }

    if (doc.downloadUrl) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  console.log(`\n${'='.repeat(62)}`);
  console.log('  INGEST SUMMARY');
  console.log('='.repeat(62));
  results.forEach(r => {
    const icon = r.status === 'UPLOADED' ? '✓' : r.status === 'MANUAL_REQUIRED' ? '⚠' : '✗';
    const detail = r.status === 'MANUAL_REQUIRED'
      ? `→ ${r.sourceUrl}`
      : r.documentId
        ? `(${r.documentId.slice(0, 8)}…)`
        : r.error || '';
    console.log(`  ${icon}  ${r.unSymbol.padEnd(22)} ${r.status.padEnd(18)} ${detail}`);
  });
  const ok = results.filter(r => r.status === 'UPLOADED').length;
  const manual = results.filter(r => r.status === 'MANUAL_REQUIRED').length;
  console.log(`\n  ${ok}/${results.length} uploaded  |  ${manual} require manual download`);
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
