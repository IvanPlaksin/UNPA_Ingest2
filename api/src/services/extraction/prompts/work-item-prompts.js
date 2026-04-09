/**
 * Specialized Prompts for Work Item Entity Extraction
 *
 * Provides type-specific prompts for User Stories, Bugs, Tasks, Features, Epics
 * with focus on extracting actors, actions, systems, and business rules.
 *
 * @module services/extraction/prompts/work-item-prompts
 * @version 1.0.0
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// WORK ITEM TYPE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Work Item type-specific prompts with system instructions and focus types
 * @constant {Object}
 */
const WORK_ITEM_PROMPTS = {
    'User Story': {
        systemPrompt: `You are extracting entities from User Stories.
A User Story describes functionality from the user's perspective.
Format: "As a [actor], I want [action], so that [benefit]"

Focus on extracting:
- Actors (user roles performing actions)
- Actions (what they want to accomplish)
- Systems (what they interact with)
- Business value (why this matters)
- Acceptance criteria as testable requirements`,

        focusTypes: ['Person', 'System', 'Feature', 'BusinessRule', 'Process'],

        extractionSchema: {
            actors: 'User roles mentioned (e.g., "admin", "manager", "end user")',
            actions: 'Actions the user wants to perform',
            systems: 'Systems or modules involved',
            benefits: 'Business value or outcomes expected'
        }
    },

    'Bug': {
        systemPrompt: `You are extracting entities from Bug descriptions.
A Bug describes a defect in the system.

Focus on extracting:
- Affected systems and modules
- Repro steps (actions that cause the bug)
- Expected vs actual behavior
- Environment (browser, version, OS)
- Error messages or codes
- Related work items`,

        focusTypes: ['System', 'Module', 'Technology', 'BusinessRule', 'API', 'Database'],

        extractionSchema: {
            affectedSystems: 'Systems where the bug occurs',
            reproSteps: 'Steps to reproduce the bug',
            errorMessages: 'Error messages or codes',
            environment: 'Browser, OS, version info'
        }
    },

    'Task': {
        systemPrompt: `You are extracting entities from technical Tasks.
A Task describes specific work to be performed.

Focus on extracting:
- Systems and components to modify
- Technologies and tools involved
- Dependencies on other tasks
- Deliverables and outcomes
- Technical specifications`,

        focusTypes: ['System', 'Module', 'API', 'Database', 'Technology', 'File'],

        extractionSchema: {
            components: 'Components or modules to change',
            technologies: 'Technologies and frameworks',
            dependencies: 'Dependencies on other work',
            deliverables: 'Expected outputs'
        }
    },

    'Feature': {
        systemPrompt: `You are extracting entities from Feature descriptions.
A Feature is a major capability that groups multiple User Stories.

Focus on extracting:
- Business capabilities delivered
- Systems affected
- Integrations required
- Business rules and constraints
- User personas involved`,

        focusTypes: ['Feature', 'System', 'BusinessRule', 'Process', 'Organization'],

        extractionSchema: {
            capabilities: 'Business capabilities being added',
            systems: 'Systems involved in the feature',
            integrations: 'Integration points',
            constraints: 'Business rules and limitations'
        }
    },

    'Epic': {
        systemPrompt: `You are extracting entities from Epics.
An Epic is a major business initiative spanning multiple Features.

Focus on extracting:
- Strategic goals and objectives
- Business processes affected
- Key stakeholders and sponsors
- Systems in scope
- Success metrics (KPIs)`,

        focusTypes: ['Epic', 'Process', 'Organization', 'System', 'Concept', 'Goal'],

        extractionSchema: {
            goals: 'Strategic objectives',
            processes: 'Business processes impacted',
            stakeholders: 'Key people and teams involved',
            metrics: 'Success criteria and KPIs'
        }
    },

    'Product Backlog Item': {
        systemPrompt: `You are extracting entities from Product Backlog Items (PBIs).
A PBI describes a piece of value to deliver to users.

Focus on extracting:
- User value being delivered
- Systems and modules involved
- Acceptance criteria
- Business rules`,

        focusTypes: ['Person', 'System', 'Feature', 'BusinessRule', 'Module'],

        extractionSchema: {
            value: 'User value proposition',
            systems: 'Systems involved',
            criteria: 'Acceptance criteria',
            rules: 'Business rules'
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GHERKIN PARSING PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prompt for parsing Gherkin-style Acceptance Criteria
 * @constant {string}
 */
const GHERKIN_EXTRACTION_PROMPT = `Parse this Acceptance Criteria in Gherkin format (Given-When-Then).

Extract structured information about:
1. **Actors** - Who is performing the action (the user, system, or role)
2. **Preconditions** (Given) - The initial state or context
3. **Actions** (When) - What action is taken
4. **Outcomes** (Then) - What result is expected
5. **Systems** - Any systems, modules, or APIs mentioned
6. **Business Rules** - Any implicit rules or constraints

Acceptance Criteria:
"""
{acceptanceCriteria}
"""

Return JSON:
{
  "scenarios": [
    {
      "name": "Scenario name or description",
      "given": ["precondition 1", "precondition 2"],
      "when": ["action 1", "action 2"],
      "then": ["expected result 1", "expected result 2"]
    }
  ],
  "actors": [
    {
      "name": "Actor name",
      "role": "user|system|admin|etc",
      "context": "How they're mentioned"
    }
  ],
  "systems": [
    {
      "name": "System name",
      "type": "System|Module|API|Database",
      "action": "What it does in this context"
    }
  ],
  "businessRules": [
    {
      "name": "Short rule name",
      "description": "Full rule description",
      "type": "VALIDATION|CALCULATION|AUTHORIZATION|WORKFLOW"
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// USER STORY PARSING PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prompt for parsing User Story format
 * @constant {string}
 */
const USER_STORY_FORMAT_PROMPT = `Parse this User Story to extract the structured format.

User Story formats:
- "As a [role], I want [action], so that [benefit]"
- "As an [role], I would like to [action], in order to [benefit]"

Text:
"""
{text}
"""

Return JSON:
{
  "isUserStoryFormat": true/false,
  "actor": {
    "role": "The role (e.g., 'admin', 'end user', 'manager')",
    "fullText": "Full text of the actor phrase"
  },
  "action": {
    "verb": "The main action verb",
    "fullText": "Full text of the action",
    "systems": ["Systems mentioned in action"]
  },
  "benefit": {
    "value": "The business value",
    "fullText": "Full text of the benefit",
    "metrics": ["Any measurable outcomes"]
  }
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD-SPECIFIC PROMPTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Prompt for title extraction (concise, key entities)
 * @constant {string}
 */
const TITLE_EXTRACTION_PROMPT = `Extract key entities from this Work Item title.
Titles are brief but contain essential information about the work.

Work Item Type: {type}
Title: "{title}"

Extract:
- Main action or change being made
- Systems, modules, or features involved
- Any specific identifiers or references

Return JSON:
{
  "mainAction": "The primary action (e.g., 'Implement', 'Fix', 'Update')",
  "entities": [
    {
      "name": "Entity name",
      "type": "System|Module|Feature|API|Database|Technology|Person|Team",
      "role": "What role this entity plays in the work item"
    }
  ]
}`;

/**
 * Prompt for description extraction
 * @constant {string}
 */
const DESCRIPTION_EXTRACTION_PROMPT = `Extract entities and relationships from this Work Item description.

{ontologyGuidance}

Work Item Type: {type}
Description:
"""
{description}
"""

Extract all mentioned:
- Systems, modules, APIs, databases
- People, teams, organizations
- Business rules and constraints
- Technical specifications
- References to other work items

Return JSON:
{
  "entities": [
    {
      "name": "Entity name",
      "type": "ENTITY_TYPE",
      "attributes": {},
      "mentions": ["quote from text where mentioned"]
    }
  ],
  "relationships": [
    {
      "source": "entity name",
      "target": "entity name",
      "type": "RELATIONSHIP_TYPE",
      "evidence": "text supporting this relationship"
    }
  ],
  "references": [
    {
      "type": "workitem|document|url",
      "value": "The reference value",
      "context": "Why it's referenced"
    }
  ]
}`;

/**
 * Prompt for extracting from comments
 * @constant {string}
 */
const COMMENT_EXTRACTION_PROMPT = `Extract entities mentioned in this Work Item comment.
Comments often contain implementation details, decisions, and clarifications.

Comment:
"""
{comment}
"""

Extract:
- Technical decisions made
- Systems or components discussed
- People mentioned
- Issues or blockers identified

Return JSON:
{
  "entities": [
    {
      "name": "Entity name",
      "type": "System|Module|Person|Technology|Decision",
      "context": "How it's mentioned"
    }
  ],
  "decisions": [
    {
      "decision": "What was decided",
      "rationale": "Why (if mentioned)",
      "alternatives": ["Other options discussed"]
    }
  ],
  "blockers": [
    {
      "issue": "The blocker or issue",
      "system": "System affected",
      "status": "resolved|pending|unknown"
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get prompt configuration for a Work Item type
 * @param {string} type - Work Item type (User Story, Bug, Task, etc.)
 * @returns {Object} Prompt configuration
 */
function getPromptForWorkItemType(type) {
    // Normalize type name
    const normalizedType = type
        ?.replace(/\s+/g, ' ')
        .trim();

    return WORK_ITEM_PROMPTS[normalizedType] ||
        WORK_ITEM_PROMPTS['Task']; // Default to Task
}

/**
 * Build Gherkin parsing prompt with actual content
 * @param {string} acceptanceCriteria - Acceptance Criteria text
 * @returns {string} Complete prompt
 */
function buildGherkinPrompt(acceptanceCriteria) {
    return GHERKIN_EXTRACTION_PROMPT.replace('{acceptanceCriteria}', acceptanceCriteria);
}

/**
 * Build User Story format prompt
 * @param {string} text - Text to analyze
 * @returns {string} Complete prompt
 */
function buildUserStoryFormatPrompt(text) {
    return USER_STORY_FORMAT_PROMPT.replace('{text}', text);
}

/**
 * Build title extraction prompt
 * @param {string} title - Work Item title
 * @param {string} type - Work Item type
 * @returns {string} Complete prompt
 */
function buildTitlePrompt(title, type) {
    return TITLE_EXTRACTION_PROMPT
        .replace('{title}', title)
        .replace('{type}', type);
}

/**
 * Build description extraction prompt with ontology guidance
 * @param {string} description - Description text
 * @param {string} type - Work Item type
 * @param {string} ontologyGuidance - Ontology snippets for guidance
 * @returns {string} Complete prompt
 */
function buildDescriptionPrompt(description, type, ontologyGuidance = '') {
    return DESCRIPTION_EXTRACTION_PROMPT
        .replace('{description}', description)
        .replace('{type}', type)
        .replace('{ontologyGuidance}', ontologyGuidance);
}

/**
 * Build comment extraction prompt
 * @param {string} comment - Comment text
 * @returns {string} Complete prompt
 */
function buildCommentPrompt(comment) {
    return COMMENT_EXTRACTION_PROMPT.replace('{comment}', comment);
}

/**
 * Check if text contains Gherkin format
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function hasGherkinFormat(text) {
    if (!text) return false;
    const gherkinKeywords = /\b(Given|When|Then|And|But|Scenario|Feature|Background)\b/i;
    return gherkinKeywords.test(text);
}

/**
 * Check if text contains User Story format
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function hasUserStoryFormat(text) {
    if (!text) return false;
    const userStoryPattern = /\b(As\s+a|As\s+an)\s+.+?,?\s+(I\s+want|I\s+would\s+like)\s+/i;
    return userStoryPattern.test(text);
}

/**
 * Parse User Story format with regex (no LLM needed)
 * @param {string} text - Text containing User Story
 * @returns {Object|null} Parsed User Story or null
 */
function parseUserStoryFormat(text) {
    if (!text) return null;

    // Pattern: As a X, I want Y, so that Z
    const pattern = /As\s+(?:a|an)\s+([^,]+?),?\s+I\s+(?:want|would\s+like)\s+(?:to\s+)?([^,]+?),?\s+(?:so\s+that|in\s+order\s+to)\s+(.+)/is;
    const match = text.match(pattern);

    if (!match) return null;

    return {
        isUserStoryFormat: true,
        actor: {
            role: match[1].trim(),
            fullText: `As a ${match[1].trim()}`
        },
        action: {
            fullText: match[2].trim(),
            verb: match[2].trim().split(/\s+/)[0]
        },
        benefit: {
            fullText: match[3].trim(),
            value: match[3].trim()
        }
    };
}

/**
 * Extract Gherkin scenarios with regex (fallback when LLM unavailable)
 * @param {string} text - Acceptance Criteria text
 * @returns {Object} Parsed scenarios
 */
function parseGherkinFormat(text) {
    if (!text) return { scenarios: [] };

    const scenarios = [];
    let currentScenario = null;

    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
        if (/^Scenario:?\s*/i.test(line)) {
            if (currentScenario) {
                scenarios.push(currentScenario);
            }
            currentScenario = {
                name: line.replace(/^Scenario:?\s*/i, '').trim(),
                given: [],
                when: [],
                then: []
            };
        } else if (/^Given\s+/i.test(line)) {
            const condition = line.replace(/^Given\s+/i, '').trim();
            if (currentScenario) {
                currentScenario.given.push(condition);
            } else {
                currentScenario = { name: 'Default', given: [condition], when: [], then: [] };
            }
        } else if (/^When\s+/i.test(line)) {
            const action = line.replace(/^When\s+/i, '').trim();
            if (currentScenario) {
                currentScenario.when.push(action);
            }
        } else if (/^Then\s+/i.test(line)) {
            const outcome = line.replace(/^Then\s+/i, '').trim();
            if (currentScenario) {
                currentScenario.then.push(outcome);
            }
        } else if (/^And\s+/i.test(line) && currentScenario) {
            // "And" continues the previous block
            const content = line.replace(/^And\s+/i, '').trim();
            if (currentScenario.then.length > 0) {
                currentScenario.then.push(content);
            } else if (currentScenario.when.length > 0) {
                currentScenario.when.push(content);
            } else {
                currentScenario.given.push(content);
            }
        }
    }

    if (currentScenario) {
        scenarios.push(currentScenario);
    }

    return { scenarios };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Prompt configurations
    WORK_ITEM_PROMPTS,
    GHERKIN_EXTRACTION_PROMPT,
    USER_STORY_FORMAT_PROMPT,
    TITLE_EXTRACTION_PROMPT,
    DESCRIPTION_EXTRACTION_PROMPT,
    COMMENT_EXTRACTION_PROMPT,

    // Prompt builders
    getPromptForWorkItemType,
    buildGherkinPrompt,
    buildUserStoryFormatPrompt,
    buildTitlePrompt,
    buildDescriptionPrompt,
    buildCommentPrompt,

    // Format detection
    hasGherkinFormat,
    hasUserStoryFormat,

    // Regex parsers (no LLM needed)
    parseUserStoryFormat,
    parseGherkinFormat
};
