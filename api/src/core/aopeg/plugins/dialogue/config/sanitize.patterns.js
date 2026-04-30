/**
 * Redaction patterns for dialogue sanitization.
 * Each pattern has: name, regex, replacement.
 */
const SANITIZE_PATTERNS = [
  // API keys
  {
    name: 'anthropic_api_key',
    regex: /sk-ant-[A-Za-z0-9\-_]{20,}/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    name: 'generic_api_key',
    regex: /\b(sk-|key-|api[_-]?key[=:\s]+)[A-Za-z0-9\-_]{16,}/gi,
    replacement: '[REDACTED_API_KEY]',
  },
  // Passwords in config/connection strings
  {
    name: 'password_param',
    regex: /\b(password|passwd|pwd|secret)[=:\s]+["']?[^\s"',;)]{4,}["']?/gi,
    replacement: '[REDACTED_PASSWORD]',
  },
  // Connection strings
  {
    name: 'mongodb_uri',
    regex: /mongodb(\+srv)?:\/\/[^\s"']+/gi,
    replacement: '[REDACTED_MONGO_URI]',
  },
  {
    name: 'redis_uri',
    regex: /redis:\/\/[^\s"']+/gi,
    replacement: '[REDACTED_REDIS_URI]',
  },
  {
    name: 'postgres_uri',
    regex: /postgres(ql)?:\/\/[^\s"']+/gi,
    replacement: '[REDACTED_DB_URI]',
  },
  // Bearer tokens
  {
    name: 'bearer_token',
    regex: /Bearer\s+[A-Za-z0-9\-_.~+/]{20,}={0,2}/g,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  // JWT tokens
  {
    name: 'jwt_token',
    regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g,
    replacement: '[REDACTED_JWT]',
  },
  // Internal URLs (UN organization domains)
  {
    name: 'internal_un_url',
    regex: /https?:\/\/[a-z0-9\-]+\.un\.org[^\s"']*/gi,
    replacement: '[REDACTED_INTERNAL_URL]',
  },
  // Private IP addresses
  {
    name: 'private_ip',
    regex: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[REDACTED_INTERNAL_IP]',
  },
  // SSH private keys
  {
    name: 'ssh_private_key',
    regex: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
];

module.exports = { SANITIZE_PATTERNS };
