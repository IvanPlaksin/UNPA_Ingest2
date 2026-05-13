/**
 * FlowDesk Service Catalog Extractor
 *
 * Extracts service catalog items from FlowDesk data/service-catalog.json.
 * Creates DraftEntity nodes with full metadata + domain relationships.
 *
 * Source format: flat array of { code, name, description, category, domain, domain_code, sla_hours, approval_required }
 *
 * @module services/workspace/extraction/flowdesk/service-catalog
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[ServiceCatalogExtractor]';
const CATALOG_PATH = path.resolve(__dirname, '../../../../services/flowdesk/data/service-catalog.json');

/**
 * Extract service catalog → DraftEntity items + relationships
 * @param {Object} options
 * @param {string} [options.catalogPath] - Override path to service-catalog.json
 * @param {Function} [options.onProgress]
 * @returns {Promise<{success, entities[], relationships[], stats, log[]}>}
 */
async function extractServiceCatalog(options = {}) {
  const catalogPath = options.catalogPath || CATALOG_PATH;
  const log = [];
  const addLog = (msg) => {
    log.push({ timestamp: new Date().toISOString(), step: 'SERVICE_CATALOG', message: msg });
    console.log(`${LOG_PREFIX} ${msg}`);
  };

  try {
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Service catalog not found: ${catalogPath}`);
    }

    const rawData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    const services = Array.isArray(rawData) ? rawData : Object.values(rawData).flat();
    addLog(`Loaded ${services.length} services`);

    // Extract entities
    const entities = services.map(svc => ({
      type: 'entity',
      name: svc.name,
      description: svc.description || `${svc.domain} service: ${svc.name}`,
      confidence: 1.0,
      content: {
        serviceCode: svc.code,
        name: svc.name,
        description: svc.description,
        category: svc.category,
        domain: svc.domain,
        domainCode: svc.domain_code,
        slaHours: svc.sla_hours,
        approvalRequired: svc.approval_required || false,
        attributes: [
          { name: 'code', dataType: 'string', required: true },
          { name: 'name', dataType: 'string', required: true },
          { name: 'domain', dataType: 'string', required: true },
          { name: 'sla_hours', dataType: 'number', required: true },
          { name: 'approval_required', dataType: 'boolean', required: false }
        ],
        entitySubType: 'SERVICE_CATALOG_ITEM'
      }
    }));

    // Extract domain entities
    const domainMap = {};
    for (const svc of services) {
      if (!domainMap[svc.domain_code]) {
        domainMap[svc.domain_code] = {
          type: 'entity',
          name: svc.domain,
          description: `Service domain: ${svc.domain}`,
          confidence: 1.0,
          content: {
            domainCode: svc.domain_code,
            domainName: svc.domain,
            serviceCount: 0,
            entitySubType: 'SERVICE_DOMAIN',
            attributes: [
              { name: 'domain_code', dataType: 'string', required: true },
              { name: 'name', dataType: 'string', required: true }
            ]
          }
        };
      }
      domainMap[svc.domain_code].content.serviceCount++;
    }
    const domainEntities = Object.values(domainMap);
    addLog(`Extracted ${domainEntities.length} domain entities`);

    // Extract category entities
    const categoryMap = {};
    for (const svc of services) {
      const key = `${svc.domain_code}:${svc.category}`;
      if (!categoryMap[key]) {
        categoryMap[key] = {
          type: 'entity',
          name: svc.category,
          description: `Service category: ${svc.category} in ${svc.domain}`,
          confidence: 1.0,
          content: {
            categoryName: svc.category,
            domainCode: svc.domain_code,
            entitySubType: 'SERVICE_CATEGORY'
          }
        };
      }
    }
    const categoryEntities = Object.values(categoryMap);
    addLog(`Extracted ${categoryEntities.length} category entities`);

    const allEntities = [...entities, ...domainEntities, ...categoryEntities];

    // Extract relationships
    const relationships = [];

    // Service → Domain (BELONGS_TO)
    for (const svc of services) {
      relationships.push({
        sourceEntity: svc.name,
        targetEntity: svc.domain,
        relationshipType: 'BELONGS_TO',
        description: `${svc.name} belongs to ${svc.domain} domain`,
        cardinality: 'MANY_TO_ONE'
      });
    }

    // Service → Category (PART_OF)
    for (const svc of services) {
      relationships.push({
        sourceEntity: svc.name,
        targetEntity: svc.category,
        relationshipType: 'PART_OF',
        description: `${svc.name} is part of ${svc.category} category`,
        cardinality: 'MANY_TO_ONE'
      });
    }

    addLog(`Extracted ${relationships.length} relationships`);

    // Stats by domain
    const byDomain = {};
    for (const svc of services) {
      byDomain[svc.domain_code] = (byDomain[svc.domain_code] || 0) + 1;
    }

    return {
      success: true,
      entities: allEntities,
      relationships,
      stats: {
        totalServices: services.length,
        domains: Object.keys(byDomain).length,
        categories: Object.keys(categoryMap).length,
        byDomain,
        totalEntities: allEntities.length,
        totalRelationships: relationships.length
      },
      log
    };
  } catch (error) {
    addLog(`ERROR: ${error.message}`);
    return { success: false, error: error.message, entities: [], relationships: [], log };
  }
}

module.exports = { extractServiceCatalog };
