#!/usr/bin/env node
/**
 * Live GXE integration test — fetches graph from catalog, executes via SSE, waits for completion.
 */
const http = require('http');

const INPUT = {
  server: 'localhost',
  database: 'FlowDesc',
  user: 'sa',
  password: 'SqlExpress2022#Dev',
  port: 1435,
  schemas: 'dbo',
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== GXE Live Integration Test ===\n');

  // 1. Fetch graph from catalog
  const catalog = await fetchJSON('http://localhost:3010/api/v1/graph-catalog/CORE-SQL-EXTRACTION-META-V1');
  const graph = catalog.data || catalog;
  console.log(`Graph: ${graph.name} — ${graph.nodes.length} nodes, ${graph.edges.length} edges\n`);

  // 2. Execute via SSE
  const payload = JSON.stringify({
    dag: { nodes: graph.nodes, edges: graph.edges },
    inputData: INPUT,
  });

  return new Promise((resolve) => {
    const postReq = http.request(
      {
        hostname: 'localhost',
        port: 3010,
        path: '/api/v1/runtime/execute-stream',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (postRes) => {
        let body = '';
        let finished = false;
        const started = new Set();
        let succeeded = 0;
        let failed = 0;
        const t0 = Date.now();

        function finish() {
          if (finished) return;
          finished = true;

          // Parse any remaining events
          parseEvents(body);

          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`\n========================================`);
          console.log(`RESULT: ${succeeded} OK / ${failed} FAIL / 14 total (${elapsed}s)`);
          console.log(`========================================`);
          process.exit(failed > 0 ? 1 : 0);
        }

        function parseEvents(raw) {
          const events = raw.split('\n\n').filter(Boolean);
          for (const e of events) {
            const lines = e.split('\n');
            const evtLine = lines.find((l) => l.startsWith('event:'));
            const dataLine = lines.find((l) => l.startsWith('data:'));
            if (!evtLine || !dataLine) continue;
            const evt = evtLine.replace(/^event:\s*/, '');
            let d;
            try {
              d = JSON.parse(dataLine.replace(/^data:\s*/, ''));
            } catch {
              continue;
            }

            if (evt === 'node:started' && d.nodeId && !started.has(d.nodeId)) {
              started.add(d.nodeId);
              console.log(`  START   ${d.nodeId}`);
            } else if (evt === 'node:completed' && d.nodeId) {
              succeeded++;
              const snippet = d.result ? JSON.stringify(d.result).substring(0, 120) : '';
              console.log(`  OK      ${d.nodeId}  ${snippet}`);
            } else if (evt === 'node:failed' && d.nodeId) {
              failed++;
              console.log(`  FAIL    ${d.nodeId}  ${d.error}  ${JSON.stringify(d.details || {}).substring(0, 200)}`);
            } else if (evt === 'execution:completed') {
              console.log(`\n  === EXECUTION COMPLETED ===`);
              finish();
            } else if (evt === 'execution:failed') {
              console.log(`\n  === EXECUTION FAILED === ${(d.error || '').substring(0, 300)}`);
              finish();
            } else if (evt === 'connected') {
              console.log(`  CONNECTED  ${d.executionId}\n`);
            }
          }
        }

        postRes.on('data', (c) => {
          body += c.toString();
          // Check for terminal events
          if (body.includes('"execution:completed"') || body.includes('"execution:failed"')) {
            // Small delay to collect last bytes
            setTimeout(finish, 500);
          }
        });

        postRes.on('end', finish);

        // Safety timeout: 3 minutes
        setTimeout(() => {
          if (!finished) {
            console.log('\n  === TIMEOUT (180s) ===');
            finish();
          }
        }, 180000);
      }
    );

    postReq.on('error', (e) => {
      console.error('Connection error:', e.message);
      process.exit(1);
    });
    postReq.write(payload);
    postReq.end();
  });
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
