/**
 * Credential Store
 * Secure credential storage in Redis with AES-256-GCM encryption.
 * Credentials NEVER stored in the graph — only in Redis.
 *
 * @module services/domain/credential-store
 */

const crypto = require('crypto');

class CredentialStore {
  /**
   * @param {import('ioredis').Redis} redisClient
   */
  constructor(redisClient) {
    this.redis = redisClient;
    this.algorithm = 'aes-256-gcm';
    // In production, CREDENTIAL_ENCRYPTION_KEY must be set (64-char hex string = 32 bytes)
    this.encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY
      ? Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, 'hex')
      : crypto.randomBytes(32);
  }

  /**
   * Redis key for credentials
   * @private
   */
  _redisKey(domainId, connectionName) {
    return `domain:${domainId}:source:${connectionName}:credentials`;
  }

  /**
   * Encrypt data with AES-256-GCM
   * @private
   * @param {Object} data - Plain data to encrypt
   * @returns {{ iv: string, authTag: string, data: string }}
   */
  _encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted,
    };
  }

  /**
   * Decrypt data
   * @private
   * @param {{ iv: string, authTag: string, data: string }} encryptedObj
   * @returns {Object}
   */
  _decrypt(encryptedObj) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(encryptedObj.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

    let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Store credentials securely
   * @param {string} domainId
   * @param {string} connectionName
   * @param {Object} credentials - e.g. { username, password, domain? }
   */
  async store(domainId, connectionName, credentials) {
    const encrypted = this._encrypt(credentials);
    const key = this._redisKey(domainId, connectionName);
    await this.redis.set(key, JSON.stringify(encrypted));
  }

  /**
   * Retrieve and decrypt credentials
   * @param {string} domainId
   * @param {string} connectionName
   * @returns {Promise<Object|null>}
   */
  async get(domainId, connectionName) {
    const key = this._redisKey(domainId, connectionName);
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      const encrypted = JSON.parse(data);
      return this._decrypt(encrypted);
    } catch (err) {
      console.error(`[CredentialStore] Failed to decrypt credentials for ${key}:`, err.message);
      return null;
    }
  }

  /**
   * Delete credentials
   * @param {string} domainId
   * @param {string} connectionName
   */
  async delete(domainId, connectionName) {
    const key = this._redisKey(domainId, connectionName);
    await this.redis.del(key);
  }

  /**
   * Check if credentials exist
   * @param {string} domainId
   * @param {string} connectionName
   * @returns {Promise<boolean>}
   */
  async exists(domainId, connectionName) {
    const key = this._redisKey(domainId, connectionName);
    return (await this.redis.exists(key)) === 1;
  }
}

module.exports = { CredentialStore };
