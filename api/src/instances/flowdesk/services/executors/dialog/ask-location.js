'use strict';

const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('../../import-config.js');

let driver;
function getDriver() {
  if (!driver) {
    driver = neo4j.driver(MEMGRAPH_CONFIG.uri, neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password), { disableLosslessIntegers: true });
  }
  return driver;
}

module.exports = {
  id: 'flowdesk.dialog.ask-location',

  async execute(context) {
    const { userInput, state } = context;

    // First call — just ask
    if (!userInput || userInput === state.justification) {
      return {
        response: `Where do you need **${state.service_name || state.service_code || 'this service'}** to be provided? Please enter a city, duty station, or country name.`,
        state_updates: {},
        condition: '_wait',
      };
    }

    // Search locations in Memgraph
    const searchTerm = userInput.trim();
    const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(`
        MATCH (loc:Location)
        WHERE loc.name CONTAINS $term
        RETURN loc.id AS id, loc.name AS name, loc.location_type AS type
        ORDER BY
          CASE loc.location_type
            WHEN 'DutyStation' THEN 1
            WHEN 'Country' THEN 2
            WHEN 'SubRegion' THEN 3
            ELSE 4
          END
        LIMIT 5
      `, { term: searchTerm });

      const matches = result.records.map(r => ({
        id: r.get('id'),
        name: r.get('name'),
        type: r.get('type'),
      }));

      if (matches.length === 0) {
        // Try case-insensitive via uppercase
        const result2 = await session.run(`
          MATCH (loc:Location)
          WHERE toUpper(loc.name) CONTAINS toUpper($term)
          RETURN loc.id AS id, loc.name AS name, loc.location_type AS type
          ORDER BY CASE loc.location_type WHEN 'DutyStation' THEN 1 WHEN 'Country' THEN 2 ELSE 3 END
          LIMIT 5
        `, { term: searchTerm });

        const matches2 = result2.records.map(r => ({ id: r.get('id'), name: r.get('name'), type: r.get('type') }));

        if (matches2.length === 0) {
          return {
            response: `I couldn't find a location matching "${searchTerm}". Please try:\n- A UN duty station name (e.g., "Brindisi", "Nairobi")\n- A country name (e.g., "Italy", "Kenya")\n- A city name`,
            state_updates: {},
            condition: 'not_found',
          };
        }

        if (matches2.length === 1) {
          return {
            response: `Got it — **${matches2[0].name}** (${matches2[0].type}).`,
            state_updates: { location: matches2[0] },
            condition: 'location_found',
          };
        }

        return {
          response: `I found several locations matching "${searchTerm}":`,
          choices: matches2.map((m, i) => ({ label: `${m.name} (${m.type})`, value: String(i + 1) })),
          state_updates: { location_candidates: matches2 },
          condition: 'multiple_matches',
        };
      }

      if (matches.length === 1) {
        return {
          response: `Got it — **${matches[0].name}** (${matches[0].type}).`,
          state_updates: { location: matches[0] },
          condition: 'location_found',
        };
      }

      return {
        response: 'I found several locations:',
        choices: matches.map((m, i) => ({ label: `${m.name} (${m.type})`, value: String(i + 1) })),
        state_updates: { location_candidates: matches },
        condition: 'multiple_matches',
      };
    } finally {
      await session.close();
    }
  },
};
