/**
 * FlowDesk: Search location in Memgraph knowledge base
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');
const tpl = require('../../services/template-store.js');

class SearchLocationExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.search_location';
    this.displayName = 'Search Location';
    this.description = 'Search for a UN location (duty station, country, city) in the knowledge graph';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        searchTerm: { type: 'string', description: 'Location search text' },
      },
      required: [],  // searchTerm optional — executor asks via WAIT_FOR_INPUT if missing
    };
  }

  async execute(parameters, context) {
    // If location already resolved from profile (no id) AND not waiting, pass through
    if (parameters.location && !parameters.waitForInput) {
      return this.success({ location: parameters.location, response: null });
    }
    // If location was already SEARCHED (has id field = resolved by search), pass through
    // This handles re-execution: T5 searched Brindisi, T6 should not re-search
    if (parameters.location && parameters.location.id) {
      return this.success({ location: parameters.location, branch: 'found', response: null });
    }

    const rawTerm = parameters.searchTerm || parameters.userInput;
    const genericTerms = ['other', 'self', 'myself', 'confirm', 'different', 'yes', 'no', 'cancel', 'edit', 'other_staff', 'i need', 'select', 'use ', 'standard', 'custom', 'skip'];
    const searchTerm = (rawTerm && rawTerm.length >= 2 && !genericTerms.some(g => rawTerm.toLowerCase().startsWith(g))) ? rawTerm : null;

    // No valid search term — ask the user
    if (!searchTerm) {
      const { randomUUID } = require('node:crypto');
      const serviceName = parameters.service_name || parameters.service_code || 'this service';
      const promptText = await tpl.render('search_location.prompt', { serviceName });
      return {
        status: 'WAIT_FOR_INPUT',
        resume_token: randomUUID(),
        expected_inputs: ['searchTerm'],
        recipients: ['current_user'],
        prompt: promptText,
        response: promptText,
      };
    }
    const neo4j = require('neo4j-driver');
    const { MEMGRAPH_CONFIG } = require('../../services/import-config.js');
    const driver = neo4j.driver(MEMGRAPH_CONFIG.uri, neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password), { disableLosslessIntegers: true });
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });

    try {
      const result = await session.run(`
        MATCH (loc:Location)
        WHERE toUpper(loc.name) CONTAINS toUpper($term)
        RETURN loc.id AS id, loc.name AS name, loc.location_type AS type
        ORDER BY CASE loc.location_type WHEN 'DutyStation' THEN 1 WHEN 'Country' THEN 2 ELSE 3 END
        LIMIT 5
      `, { term: searchTerm });

      const matches = result.records.map(r => ({ id: r.get('id'), name: r.get('name'), type: r.get('type') }));

      if (matches.length === 0) {
        return this.success({
          matches: [],
          response: await tpl.render('search_location.not_found', { searchTerm }),
          choices: null,
          branch: 'not_found',
        });
      }

      if (matches.length === 1) {
        return this.success({
          location: matches[0],
          matches,
          response: await tpl.render('search_location.found_one', matches[0]),
          choices: null,
          branch: 'found',
        });
      }

      return this.success({
        matches,
        response: await tpl.get('search_location.found_multiple', 'I found several locations:'),
        choices: matches.map((m, i) => ({ label: `${m.name} (${m.type})`, value: String(i + 1) })),
        branch: 'multiple',
      });
    } catch (err) {
      return this.error('SEARCH_LOCATION_ERROR', err.message, true);
    } finally {
      await session.close();
      await driver.close();
    }
  }
}

module.exports = { SearchLocationExecutor };
