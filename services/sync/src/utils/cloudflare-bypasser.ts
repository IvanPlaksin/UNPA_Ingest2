/**
 * Cloudflare Bypasser
 *
 * Использует got-scraping для обхода Cloudflare защиты
 * путем эмуляции браузерных HTTP/2 fingerprints и заголовков.
 */

import { createLogger } from './logger.js';

const logger = createLogger('cloudflare-bypasser');

// Динамический импорт got-scraping
let gotScraping: any;
let OptionsInit: any;

async function loadGotScraping() {
  if (!gotScraping) {
    const module = await import('got-scraping');
    gotScraping = module.gotScraping;
  }
  return gotScraping;
}

interface OptionsInit {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: { request: number };
  headerGeneratorOptions?: {
    browsers: Array<{
      name: 'chrome' | 'firefox' | 'safari';
      minVersion: number;
      maxVersion: number;
      httpVersion: string;
    }>;
    devices: string[];
    locales: string[];
    operatingSystems: string[];
  };
  throwHttpErrors?: boolean;
  followRedirect?: boolean;
  maxRedirects?: number;
  retry?: {
    limit: number;
    methods: string[];
    statusCodes: number[];
  };
}

export interface CloudflareBypasserOptions {
  /** Cookie значение sessionKey */
  sessionKey: string;
  /** User Agent (опционально, по умолчанию Chrome) */
  userAgent?: string;
  /** Базовый URL для Referer */
  baseReferer?: string;
  /** Timeout для запросов (мс) */
  timeout?: number;
}

export interface CloudflareResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * CloudflareBypasser - обходит Cloudflare защиту используя got-scraping
 *
 * got-scraping эмулирует:
 * - HTTP/2 fingerprints Chrome/Firefox
 * - TLS fingerprints
 * - Правильные заголовки браузера
 * - User-Agent и другие Browser hints
 */
/**
 * Maps HTTP status codes to descriptive, actionable error messages.
 * Used across all services that communicate with the Claude.ai API.
 */
export function describeHttpError(statusCode: number, body: string, url?: string): string {
  const urlHint = url ? ` (${url.replace(/https?:\/\/[^/]+/, '')})` : '';
  const bodyPreview = body.substring(0, 300).trim();

  switch (statusCode) {
    case 401:
      return (
        `HTTP 401 Unauthorized${urlHint}: CLAUDE_SESSION_KEY is invalid or has expired. ` +
        `Get a fresh session key: open claude.ai in your browser → DevTools (F12) → ` +
        `Application → Cookies → sessionKey, then update CLAUDE_SESSION_KEY in .env / config.`
      );
    case 403:
      if (body.includes('Just a moment')) {
        return (
          `HTTP 403 Cloudflare Challenge${urlHint}: Cloudflare is blocking the request despite ` +
          `bypass attempt. Try refreshing CLAUDE_SESSION_KEY with a recently active browser session.`
        );
      }
      return (
        `HTTP 403 Forbidden${urlHint}: Access denied. Verify that CLAUDE_SESSION_KEY belongs to ` +
        `an account with access to the configured CLAUDE_ORGANIZATION_ID / CLAUDE_PROJECT_ID, ` +
        `or the session may have expired.`
      );
    case 404:
      return (
        `HTTP 404 Not Found${urlHint}: The requested resource does not exist. ` +
        `Verify the conversation/resource ID is correct and that it has not been deleted.`
      );
    case 429:
      return (
        `HTTP 429 Too Many Requests${urlHint}: Claude.ai rate limit exceeded. ` +
        `Wait a moment before retrying. The server enforces request throttling.`
      );
    case 500:
      return (
        `HTTP 500 Internal Server Error${urlHint}: Claude.ai server error — ` +
        `this is a temporary issue on Anthropic's side. Retry later. ` +
        `Response: ${bodyPreview}`
      );
    case 502:
    case 503:
    case 504:
      return (
        `HTTP ${statusCode} Service Unavailable${urlHint}: Claude.ai is temporarily unavailable. ` +
        `Retry after a short delay.`
      );
    default:
      return (
        `HTTP ${statusCode} Error${urlHint}: Unexpected response from Claude.ai API. ` +
        `Response preview: ${bodyPreview}`
      );
  }
}

export class CloudflareBypasser {
  private options: Required<CloudflareBypasserOptions>;

  constructor(options: CloudflareBypasserOptions) {
    this.options = {
      sessionKey: options.sessionKey,
      userAgent: options.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      baseReferer: options.baseReferer || 'https://claude.ai',
      timeout: options.timeout || 30000
    };

    logger.info('CloudflareBypasser initialized');
  }

  /**
   * Выполняет HTTP GET запрос с обходом Cloudflare
   */
  async get(url: string, additionalHeaders?: Record<string, string>): Promise<CloudflareResponse> {
    const headers: Record<string, string> = {
      'Cookie': `sessionKey=${this.options.sessionKey}`,
      'User-Agent': this.options.userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': this.options.baseReferer,
      'Origin': 'https://claude.ai',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...additionalHeaders
    };

    const requestOptions: OptionsInit = {
      url,
      method: 'GET',
      headers,
      timeout: {
        request: this.options.timeout
      },
      // Используем Chrome browser hints
      headerGeneratorOptions: {
        browsers: [
          {
            name: 'chrome' as const,
            minVersion: 120,
            maxVersion: 131,
            httpVersion: '2'
          }
        ],
        devices: ['desktop'],
        locales: ['en-US'],
        operatingSystems: ['windows']
      },
      // Дополнительные опции
      throwHttpErrors: false,
      followRedirect: true,
      maxRedirects: 5,
      retry: {
        limit: 2,
        methods: ['GET'],
        statusCodes: [408, 413, 429, 500, 502, 503, 504]
      }
    };

    try {
      logger.debug({ url, headers: Object.keys(headers) }, 'Making request with Cloudflare bypass');

      const scraperFn = await loadGotScraping();
      const response = await scraperFn(requestOptions);

      const cfResponse = response as { statusCode: number; headers: Record<string, string>; body: string };

      const result: CloudflareResponse = {
        statusCode: cfResponse.statusCode,
        headers: cfResponse.headers,
        body: cfResponse.body
      };

      // Проверяем на Cloudflare challenge
      if (result.statusCode === 403 && result.body.includes('Just a moment')) {
        logger.warn({ url }, 'Cloudflare challenge detected despite bypass attempt');
        throw new Error('Cloudflare challenge detected - bypass failed');
      }

      if (result.statusCode >= 400) {
        logger.error({
          url,
          statusCode: result.statusCode,
          bodyPreview: result.body.substring(0, 200)
        }, 'Request failed');
      } else {
        logger.debug({ url, statusCode: result.statusCode }, 'Request successful');
      }

      return result;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        url
      }, 'Request failed with error');
      throw error;
    }
  }

  /**
   * Выполняет HTTP POST запрос с обходом Cloudflare
   */
  async post(
    url: string,
    body: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<CloudflareResponse> {
    const headers: Record<string, string> = {
      'Cookie': `sessionKey=${this.options.sessionKey}`,
      'User-Agent': this.options.userAgent,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Content-Type': 'application/json',
      'Referer': this.options.baseReferer,
      'Origin': 'https://claude.ai',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...additionalHeaders
    };

    const requestOptions: OptionsInit = {
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: {
        request: this.options.timeout
      },
      headerGeneratorOptions: {
        browsers: [
          {
            name: 'chrome' as const,
            minVersion: 120,
            maxVersion: 131,
            httpVersion: '2'
          }
        ],
        devices: ['desktop'],
        locales: ['en-US'],
        operatingSystems: ['windows']
      },
      throwHttpErrors: false,
      followRedirect: true,
      maxRedirects: 5
    };

    try {
      logger.debug({ url, headers: Object.keys(headers) }, 'Making POST request with Cloudflare bypass');

      const scraperFn = await loadGotScraping();
      const response = await scraperFn(requestOptions);

      const cfResponse = response as { statusCode: number; headers: Record<string, string>; body: string };

      const result: CloudflareResponse = {
        statusCode: cfResponse.statusCode,
        headers: cfResponse.headers,
        body: cfResponse.body
      };

      if (result.statusCode === 403 && result.body.includes('Just a moment')) {
        logger.warn({ url }, 'Cloudflare challenge detected despite bypass attempt');
        throw new Error('Cloudflare challenge detected - bypass failed');
      }

      if (result.statusCode >= 400) {
        logger.error({
          url,
          statusCode: result.statusCode,
          bodyPreview: result.body.substring(0, 200)
        }, 'POST request failed');
      } else {
        logger.debug({ url, statusCode: result.statusCode }, 'POST request successful');
      }

      return result;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        url
      }, 'POST request failed with error');
      throw error;
    }
  }

  /**
   * Обновляет sessionKey
   */
  updateSessionKey(sessionKey: string): void {
    this.options.sessionKey = sessionKey;
    logger.info('SessionKey updated');
  }

  /**
   * Обновляет referer
   */
  updateReferer(referer: string): void {
    this.options.baseReferer = referer;
    logger.debug({ referer }, 'Referer updated');
  }
}
