'use strict';
require('dotenv').config();
const { axios, httpsAgent } = require('./src/services/knowledge/source-adapters/lib/http');

const COOKIES = [
  `SIMI=eyJzdCI6MH0=`,
  `spo_abt=MjQwMCxbImR2Y19tbmdkIiwia21zaSJdLCwwMGFhNzhiOS1mMzIxLWYxZGEtMzVhMC1iNDE1ZDg2ODE2Njk=`,
  `rtFa=zN9Hpw6mhYdK14va372j7L5xNPmZRbnWtPxSY15WDQMmMGY5ZTM1ZGItNTQ0Zi00ZjYwLWJkY2MtNWVhNDE2ZTZkYzcwIzEzNDI3Mzg5MDI0NTUyNDg5NCM3MzAzMjNhMi0xMDhkLTAwMDEtZTkwMy01OGI2MGZkN2QzOTgjaXZhbi5wbGFrc2luJTQwdW4ub3JnIzIwNTY2NyNPZkNfdHpKQTdqYnBPUzdkTmx6RlpOci1LV2MjT2ZDX3R6SkE3amJwT1M3ZE5sekZaTnItS1djYKQ83sG0D+yJ2o839P7mloCoMT8KFSgx2RmZxhhLzEDDlOAcHB59SxgFfoEHaWQv6Nq0rIHwG8VPd63Z+LEnQoPv1ToUyzoDXftwAp46Rm09q9MA7gLz4JO3S4arJWjhtJ8cLoRG7LTnBZABImLQGC24FfqKmNSeRA4mM5JWFGS8DNkRt7UJ5OHXAqulR8zTt5jNhMOVTt0AhlO5YUbbiWVGBb63Yzbwts1t1I/Bea8qiGnVAh3hvbbjrkHPLO3BfGK9cEE22WNQC6xkWAJB99SOn3E8YQ5eT5kO2mayOWD27ddGlTG8D6Z9AZtjWs3/ySM457o9IX+tF2+E4uAuHdIAAAA=`,
  `ScaleCompatibilityDeviceId=43719aec-973a-47d2-8980-f7ff36241f53`,
  `SPHomeWeb:NGSP/experienceActive=true`,
  `FeatureOverrides_experiments=[]`,
  `msal.cache.encryption=%7B%22id%22%3A%22019f1e0a-6abd-793d-b27a-b6266af1d150%22%2C%22key%22%3A%22f7jsyk0p8FOSZS62VSHHzgVQFJ8UMxMjZ9dFAcFubFs%22%7D`,
  `FedAuth=77u/PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48U1A+VjE1LDBoLmZ8bWVtYmVyc2hpcHwxMDAzMjAwNTE5MjdmMTVkQGxpdmUuY29tLDAjLmZ8bWVtYmVyc2hpcHxpdmFuLnBsYWtzaW5AdW4ub3JnLDEzNDI3MzgwMTIwMDAwMDAwMCwxMzQyNDE2OTc2NjAwMDAwMDAsMTM0Mjg0MjA5MDA3NzMwMDE3LDg1LjE1OS4yMDMuMyw2NTYwMywwZjllMzVkYi01NDRmLTRmNjAtYmRjYy01ZWE0MTZlNmRjNzAsLDAwYWE3OGI5LWYzMjEtZjFkYS0zNWEwLWI0MTVkODY4MTY2OSw3MzAzMjNhMi1jMDkwLTAwMDEtZTkwMy01NjIwY2FiZTk4MTIsODkzZjI1YTItMjBiYS0wMDAxLWU5MDMtNTRmNjVkZDNjMDlhLCwwLDEzNDI3OTkyNTAwNzY1MTY5OSwxMzQyODI0ODEwMDc2NTE2OTksLCxleUo0YlhOZlkyTWlPaUpiWENKRFVERmNJbDBpTENKNGJYTmZjM010SWpvaU1TSXNJbkJ5WldabGNuSmxaRjkxYzJWeWJtRnRaU0k2SW1sMllXNHVjR3hoYTNOcGJrQjFiaTV2Y21jaUxDSjFkR2tpT2lKcVgwVklPSHBGYzBWRmRUSmtSVnAxYzBoNFFVRkJJaXdpWVhWMGFGOTBhVzFsSWpvaU1UTTBNamN6T0RBeE1qQXdNREF3TURBd0luMD0sMjY1MDQ2Nzc0Mzk5OTk5OTk5OSwxMzQyNzM4OTAyNDAwMDAwMDAsYjJkOTc2MDEtODY1Yi00NDRmLWIzNjktNTkxMmVjYWJiMzYwLCwsLCwsMTE1MjkyMTUwNDYwNjg0Njk3NiwsMjA1NjY3LHJoSmh1WHMteGxwTEQtZl91cWRDQzlYUnBSWSwsMjA1NjY3LHJoSmh1WHMteGxwTEQtZl91cWRDQzlYUnBSWSxXbnF3NWRrYzZjd1MyaUlEeE10eWZlZndkL3hxTnE1dUk0Kzd4RGU1YlpQQ0cwL1EwbmtEcDE5UEZ4Y3F0Mng5UnlPdWhWNnVlYWpIZFNHL2V6by9mVlU2Nlh4SDM2cHNnYTJtenFXajdQMjFXWjU1VHNOVUVLTm9KSVBIOWQrRDRnelA4R0ZVSTh5ZElIdjE5THZBNlVseVRGaG8ydWVReENoKzVFai9FY1p4R1BvaGwyNWptR3B0VEhkZkl6czZuZXI0cUxubHlraURWUy9WNFp2bU1qQXdOYVNhS3FQbU5PK0x2VTlDZTczZnlRS1I1TW96ODBmYVdScHJiSmQzbW5qR1R3ZFZQeXIrRjFsYmZkNGxudjlPUGtuQmx6THBCREwxemhDdTJ1ejRQK3dMa1dNRStIOFh6M2dubW5vSTJxNWQ1YXBuYjhEM29LYWJET0hvY1E9PTwvU1A+`,
  `SPWorkLoadAttribution=Url=https://unitednations.sharepoint.com/sites/APP-Gateway/&AppTitle=RenderClientSideBasePage`,
  `ai_user=wX1Ga|2026-07-08T12:56:57.149Z`,
].join('; ');

const BASE = 'https://unitednations.sharepoint.com';
const SITE = `${BASE}/sites/APP-Gateway`;

// Exact headers from browser successful request
const BROWSER_HDRS = {
  'Cookie':              COOKIES,
  'User-Agent':          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept':              'application/json;odata.metadata=minimal',
  'Accept-Encoding':     'gzip, deflate, br, zstd',
  'Accept-Language':     'en-US,en;q=0.9,ru-UA;q=0.8,ru;q=0.7',
  'Origin':              BASE,
  'Referer':             `${SITE}/`,
  'odata-version':       '4.0',
  'sec-ch-ua':           '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  'sec-ch-ua-mobile':    '?0',
  'sec-ch-ua-platform':  '"Windows"',
  'sec-fetch-dest':      'empty',
  'sec-fetch-mode':      'cors',
  'sec-fetch-site':      'same-origin',
};

async function get(url, extra = {}) {
  return axios.get(url, {
    httpsAgent, timeout: 20000,
    headers: { ...BROWSER_HDRS, ...extra },
    maxRedirects: 5,
    validateStatus: s => s < 600,
  });
}

async function main() {
  // 1. Replicate exact browser call
  console.log('\n=== 1. Exact browser endpoint: SP_TenantSettings_Current ===');
  const r0 = await get(`${BASE}/_api/SP_TenantSettings_Current`);
  console.log(`Status: ${r0.status}`);
  console.log(`Body: ${JSON.stringify(r0.data).slice(0, 200)}`);

  // 2. Site web info
  console.log('\n=== 2. Site web info ===');
  const r1 = await get(`${SITE}/_api/web?$select=Title,Url,Description`);
  console.log(`Status: ${r1.status}`);
  if (r1.status === 200) {
    console.log(`Title: ${r1.data?.d?.Title}`);
    console.log(`Url:   ${r1.data?.d?.Url}`);
  } else {
    console.log(`Body: ${JSON.stringify(r1.data).slice(0, 200)}`);
    // Try without /sites/APP-Gateway prefix
    const r1b = await get(`${BASE}/_api/web?$select=Title,Url`);
    console.log(`Root web status: ${r1b.status} → ${JSON.stringify(r1b.data).slice(0, 200)}`);
  }

  // 3. Try IDCRL authentication endpoint (mentioned in 403 header)
  console.log('\n=== 3. IDCRL svc ===');
  const r2 = await get(`${SITE}/_vti_bin/idcrl.svc/`);
  console.log(`Status: ${r2.status}`);
  console.log(`Body: ${JSON.stringify(r2.data).slice(0, 200)}`);
}

main().then(() => { console.log('\nDone.'); process.exit(0); })
      .catch(e => { console.error('Fatal:', e.message); process.exit(1); });
