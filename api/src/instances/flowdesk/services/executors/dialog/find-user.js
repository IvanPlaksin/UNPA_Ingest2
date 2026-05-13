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
  id: 'flowdesk.dialog.find-user',

  async execute(context) {
    const { userInput, state } = context;

    // First call — ask
    if (!userInput || state._find_user_asked) {
      // Already asked, this is a response
    } else if (!state.beneficiary && state.beneficiary_type === 'other') {
      return {
        response: 'Please provide the **name** or **email** of the staff member this request is for.',
        state_updates: { _find_user_asked: true },
        condition: '_wait',
      };
    }

    const searchTerm = userInput?.trim();
    if (!searchTerm) {
      return {
        response: 'Please provide a name or email address.',
        state_updates: {},
        condition: '_wait',
      };
    }

    // Search users in Memgraph
    const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(`
        MATCH (u:User)
        WHERE u.email CONTAINS $term
           OR toUpper(u.display_name) CONTAINS toUpper($term)
        RETURN u.id AS id, u.email AS email, u.display_name AS name
        LIMIT 5
      `, { term: searchTerm });

      const matches = result.records.map(r => ({
        id: r.get('id'),
        email: r.get('email'),
        name: r.get('name'),
      }));

      if (matches.length === 0) {
        return {
          response: `I couldn't find a staff member matching "${searchTerm}". Please try their email address or full name.`,
          state_updates: { _find_user_asked: true },
          condition: 'not_found',
        };
      }

      if (matches.length === 1) {
        return {
          response: `Found — **${matches[0].name}** (${matches[0].email}).`,
          state_updates: { beneficiary: matches[0], _find_user_asked: null },
          condition: 'found',
        };
      }

      // Multiple matches
      return {
        response: `I found several staff members:\n${matches.map((m, i) => `${i + 1}. **${m.name}** (${m.email})`).join('\n')}\n\nPlease reply with the number.`,
        state_updates: { _user_candidates: matches, _find_user_asked: true },
        condition: 'multiple',
      };
    } finally {
      await session.close();
    }
  },
};
