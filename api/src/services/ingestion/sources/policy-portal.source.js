'use strict';

/**
 * PolicyPortalSource — ingestion adapter for policy.un.org.
 *
 * Stub implementation. Provides the contract for fetching and normalising
 * policy documents from the UN Policy Portal into the standard document
 * schema consumed by the ingestion pipeline.
 *
 * Integration points (to be wired once the site structure is confirmed):
 *   - Use in ingestion-pipeline.js as sourceType: 'POLICY_PORTAL'
 *   - Entity store importFromDocument() handles ES_RELATED_TO + evidence nodes
 *   - supersessionService.createSupersession() called when a document replaces another
 *
 * Document attributes populated for ESEntity nodes of type DOCUMENT:
 *   documentSymbol, effectiveDate, expirationDate, issuingAuthority,
 *   documentCategory, isInForce
 */

const SOURCE_ID = 'POLICY_PORTAL';
const BASE_URL  = 'https://policy.un.org';

class PolicyPortalSource {
  constructor(config = {}) {
    this.baseUrl    = config.baseUrl    || BASE_URL;
    this.maxRetries = config.maxRetries || 3;
    this.delayMs    = config.delayMs    || 1000;
  }

  /**
   * Fetch a list of policy documents from the portal index.
   * @param {object} options
   * @param {number} options.page — page number (1-based)
   * @param {string} options.category — optional category filter
   * @returns {Promise<Array<{symbol, title, url, effectiveDate, category}>>}
   */
  async fetchIndex({ page = 1, category = null } = {}) {
    throw new Error('PolicyPortalSource.fetchIndex() — not yet implemented. Portal HTML structure pending analysis.');
  }

  /**
   * Fetch and parse a single policy document by its portal URL.
   * @param {string} url — full URL to the document page
   * @returns {Promise<PolicyDocument>}
   */
  async fetchDocument(url) {
    throw new Error('PolicyPortalSource.fetchDocument() — not yet implemented.');
  }

  /**
   * Detect SUPERSEDES relationships from a parsed document's content.
   * Policy documents typically contain "This policy supersedes ST/SGB/XXXX" text.
   * @param {PolicyDocument} doc
   * @returns {string[]} — array of document symbols that this doc supersedes
   */
  detectSupersessions(doc) {
    if (!doc?.text) return [];
    const patterns = [
      /supersedes?\s+([A-Z]{2}\/[A-Z]+\/\d+(?:\/[A-Z]+)?(?:\/\d+)?)/gi,
      /replaces?\s+([A-Z]{2}\/[A-Z]+\/\d+(?:\/[A-Z]+)?(?:\/\d+)?)/gi,
      /cancels?\s+([A-Z]{2}\/[A-Z]+\/\d+(?:\/[A-Z]+)?(?:\/\d+)?)/gi,
      /amends?\s+([A-Z]{2}\/[A-Z]+\/\d+(?:\/[A-Z]+)?(?:\/\d+)?)/gi,
    ];
    const found = new Set();
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(doc.text)) !== null) {
        found.add(m[1].trim());
      }
    }
    return [...found];
  }

  /**
   * Normalise raw portal document data into the standard ingestion document schema.
   * @param {object} raw — parsed HTML data from the portal
   * @returns {object} — normalised document object
   */
  normalise(raw) {
    return {
      sourceType:       SOURCE_ID,
      externalId:       raw.symbol || raw.id,
      title:            raw.title  || raw.symbol,
      url:              raw.url    || null,
      documentSymbol:   raw.symbol || null,
      effectiveDate:    raw.effectiveDate    || null,
      expirationDate:   raw.expirationDate   || null,
      issuingAuthority: raw.issuingAuthority || 'United Nations Secretariat',
      documentCategory: raw.category         || null,
      isInForce:        raw.isInForce        ?? true,
      text:             raw.text             || null,
      language:         raw.language         || 'EN',
    };
  }
}

const policyPortalSource = new PolicyPortalSource();
module.exports = { policyPortalSource, PolicyPortalSource, SOURCE_ID };
