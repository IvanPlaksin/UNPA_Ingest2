/**
 * FlowDesk: Find staff member in knowledge graph
 */

const { BaseExecutor } = require('../../plugin-base');
const tpl = require('../../../../../services/flowdesk/template-store');

class FindUserExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.find_user';
    this.displayName = 'Find User';
    this.description = 'Search for a staff member by name or email in the knowledge graph';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        searchTerm: { type: 'string', description: 'Name or email to search' },
      },
      required: [],
    };
  }

  async execute(parameters) {
    const { randomUUID } = require('node:crypto');

    // If beneficiary already resolved in previous turn, pass through
    if (parameters.beneficiary && parameters.beneficiary.id) {
      return this.success({ beneficiary: parameters.beneficiary, branch: 'found', response: null });
    }

    // If waitForInput is set and searchTerm is not a person name (too short or generic),
    // return WAIT_FOR_INPUT to ask for a proper search query
    if (parameters.waitForInput) {
      const term = (parameters.searchTerm || parameters.userInput || '').trim();
      const genericTerms = ['other', 'self', 'myself', 'confirm', 'different', 'yes', 'no', 'cancel', 'edit', 'other_staff'];
      if (!term || term.length < 2 || genericTerms.includes(term.toLowerCase())) {
        return {
          status: 'WAIT_FOR_INPUT',
          resume_token: randomUUID(),
          expected_inputs: ['userInput'],
          recipients: ['current_user'],
          prompt: parameters.prompt || 'Please enter the name of the staff member:',
          choices: null,
        };
      }
    }

    const searchTerm = this.getRequiredParam(parameters, 'searchTerm');
    const neo4j = require('neo4j-driver');
    const { MEMGRAPH_CONFIG } = require('../../../../../services/flowdesk/import-config');
    const driver = neo4j.driver(MEMGRAPH_CONFIG.uri, neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password), { disableLosslessIntegers: true });
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });

    try {
      const result = await session.run(`
        MATCH (u:User)
        WHERE u.email CONTAINS $term OR toUpper(u.display_name) CONTAINS toUpper($term)
        RETURN u.id AS id, u.email AS email, u.display_name AS name
        LIMIT 5
      `, { term: searchTerm });

      const matches = result.records.map(r => ({ id: r.get('id'), email: r.get('email'), name: r.get('name') }));

      if (matches.length === 0) {
        return this.success({
          matches: [],
          response: await tpl.render('find_user.not_found', { searchTerm }),
          branch: 'not_found',
        });
      }

      if (matches.length === 1) {
        return this.success({
          beneficiary: matches[0],
          response: await tpl.render('find_user.found_one', matches[0]),
          branch: 'found',
        });
      }

      return this.success({
        matches,
        response: await tpl.get('find_user.found_multiple', 'I found several staff members:'),
        choices: matches.map((m, i) => ({ label: `${m.name} (${m.email})`, value: String(i + 1) })),
        branch: 'multiple',
      });
    } catch (err) {
      return this.error('FIND_USER_ERROR', err.message, true);
    } finally {
      await session.close();
      await driver.close();
    }
  }
}

module.exports = { FindUserExecutor };
