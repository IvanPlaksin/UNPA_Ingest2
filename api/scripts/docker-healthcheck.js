/**
 * Docker Health Check Script
 *
 * Used by Docker HEALTHCHECK instruction.
 * Exit code 0 = healthy, 1 = unhealthy.
 */

const http = require('http');

const port = process.env.PORT || 3000;
const timeout = 3000;

const req = http.request(
  { host: '127.0.0.1', port, path: '/health', timeout },
  (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const body = JSON.parse(data);
          if (body.status === 'OK') {
            process.exit(0);
          }
        } catch {}
      }
      process.exit(1);
    });
  }
);

req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();
