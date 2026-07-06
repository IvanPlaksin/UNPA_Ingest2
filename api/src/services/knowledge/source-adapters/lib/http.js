'use strict';
/**
 * Shared HTTP helpers for source adapters.
 * Reuses a single HTTPS agent that tolerates self-signed UN certs (many
 * UN sub-domains present incomplete chains).
 */

const axios = require('axios');
const https = require('https');

// Skips cert verification for self-signed / incomplete UN cert chains.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// A browser-like UA gets past the simplest bot filters on UN sites.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

module.exports = { axios, httpsAgent, BROWSER_HEADERS };
