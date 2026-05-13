'use strict';

/**
 * FlowDesk: Laptop Provisioning Assistant
 *
 * Multi-step Q&A executor that guides the user through laptop selection.
 * Manages its own conversation state via parameters (persisted in executionContext).
 *
 * Dialog stages:
 *   1. beneficiary  — self or colleague
 *   2. use_case     — development / office / design / engineering / general
 *   3. budget       — <1000 / 1000-1500 / 1500-2500 / 2500+
 *   4. priority     — portability / performance / battery / display
 *   5. recommend    — present top match, ask for confirmation
 *
 * Returns on completion:
 *   { recommendation, requirements, branch: "confirmed" | "cancelled" }
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');
const { randomUUID } = require('node:crypto');

// ── Laptop catalog ─────────────────────────────────────────────────────────
const LAPTOP_CATALOG = [
  {
    id: 'DELL-XPS-13',
    name: 'Dell XPS 13',
    price_range: '$999–$1,199',
    best_for: ['office', 'general'],
    strengths: ['compact', 'portability', 'battery'],
    specs: '13" FHD+, Intel Core i5/i7, 16GB RAM, 512GB SSD',
  },
  {
    id: 'LENOVO-X1-CARBON',
    name: 'Lenovo ThinkPad X1 Carbon',
    price_range: '$1,299–$1,699',
    best_for: ['office', 'general', 'engineering'],
    strengths: ['portability', 'battery', 'keyboard'],
    specs: '14" 2.8K, Intel Core i7, 16GB RAM, 1TB SSD',
  },
  {
    id: 'DELL-PRECISION-5680',
    name: 'Dell Precision 5680',
    price_range: '$1,499–$2,499',
    best_for: ['development', 'engineering'],
    strengths: ['performance', 'display'],
    specs: '16" 3.5K OLED, Intel Core i9/Xeon, 32GB RAM, 1TB SSD, NVIDIA RTX A2000',
  },
  {
    id: 'MACBOOK-PRO-14',
    name: 'MacBook Pro 14"',
    price_range: '$1,999–$2,499',
    best_for: ['design', 'development'],
    strengths: ['performance', 'display', 'battery'],
    specs: '14" Liquid Retina XDR, Apple M3 Pro, 18GB RAM, 512GB SSD',
  },
  {
    id: 'HP-ZBOOK-STUDIO',
    name: 'HP ZBook Studio G10',
    price_range: '$2,199–$3,499',
    best_for: ['engineering', 'design'],
    strengths: ['performance', 'display'],
    specs: '16" 4K OLED, Intel Core i9, 32GB RAM, 2TB SSD, NVIDIA RTX 4070',
  },
];

// ── Budget tier labels ─────────────────────────────────────────────────────
const BUDGET_LABELS = {
  'under_1000': 'Under $1,000',
  '1000_1500': '$1,000 – $1,500',
  '1500_2500': '$1,500 – $2,500',
  'over_2500': 'Over $2,500',
};

// ── Budget → price filter ──────────────────────────────────────────────────
const BUDGET_MAX = {
  'under_1000': 1000,
  '1000_1500': 1500,
  '1500_2500': 2500,
  'over_2500': Infinity,
};

function recommendLaptop(use_case, budget_tier, priority) {
  const maxPrice = BUDGET_MAX[budget_tier] || Infinity;

  // Filter by budget — split on en-dash first, then strip non-digits from max part
  const affordable = LAPTOP_CATALOG.filter(l => {
    const parts = l.price_range.split('–');
    const maxPart = (parts[1] || parts[0]).replace(/[^0-9]/g, '');
    const maxInRange = parseInt(maxPart, 10) || 9999;
    return maxInRange <= maxPrice || maxPrice === Infinity;
  });

  if (affordable.length === 0) return LAPTOP_CATALOG[0];

  // Score by use_case + priority
  const scored = affordable.map(l => {
    let score = 0;
    if (l.best_for.includes(use_case)) score += 3;
    if (priority && l.strengths.includes(priority)) score += 2;
    return { ...l, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ── Stage definitions ──────────────────────────────────────────────────────
const STAGES = ['beneficiary', 'use_case', 'budget', 'priority', 'confirm'];

function nextStage(state) {
  for (const s of STAGES) {
    if (!state[s]) return s;
  }
  return null;
}

class LaptopAssistantExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.laptop_assistant';
    this.displayName = 'Laptop Provisioning Assistant';
    this.description = 'Multi-step Q&A to gather laptop requirements and create a service request';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        userInput: { type: 'string' },
        stage: { type: 'string' },
        beneficiary: { type: 'string' },
        use_case: { type: 'string' },
        budget: { type: 'string' },
        priority: { type: 'string' },
      },
    };
  }

  async execute(parameters) {
    // On first invocation (no prior stage), start fresh — ignore NLU pre-extracted entities
    // so the dialog always begins at the beneficiary question.
    const isFirstTurn = !parameters.stage;
    const state = {
      beneficiary: isFirstTurn ? null : (parameters.beneficiary || null),
      use_case: isFirstTurn ? null : (parameters.use_case || null),
      budget: isFirstTurn ? null : (parameters.budget || null),
      priority: isFirstTurn ? null : (parameters.priority || null),
      confirm: isFirstTurn ? null : (parameters.confirm || null),
    };

    const currentStage = parameters.stage || nextStage(state);
    // Don't process userInput on first turn — the initial message is a service request intent,
    // not a Q&A answer.
    const userInput = isFirstTurn ? '' : (parameters.userInput || '').trim().toLowerCase();

    // ── Process userInput for current stage ─────────────────────────────
    if (userInput) {
      switch (currentStage) {
        case 'beneficiary':
          state.beneficiary = this._parseBeneficiary(userInput);
          break;
        case 'use_case':
          state.use_case = this._parseUseCase(userInput);
          break;
        case 'budget':
          state.budget = this._parseBudget(userInput);
          break;
        case 'priority':
          state.priority = this._parsePriority(userInput);
          break;
        case 'confirm':
          state.confirm = this._parseConfirm(userInput);
          break;
      }
    }

    // ── Determine next step ───────────────────────────────────────────────
    const nextStep = nextStage(state);

    if (nextStep === 'beneficiary') {
      return this._waitInput('beneficiary', {
        prompt: 'Hello! I\'m here to help with your laptop request.\n\nWho is this laptop for?',
        choices: [
          { label: 'For myself', value: 'myself' },
          { label: 'For a colleague', value: 'colleague' },
        ],
        state,
      });
    }

    if (nextStep === 'use_case') {
      return this._waitInput('use_case', {
        prompt: 'What will the laptop primarily be used for?',
        choices: [
          { label: 'Software Development', value: 'development' },
          { label: 'Office / Administration', value: 'office' },
          { label: 'Graphic Design / Creative', value: 'design' },
          { label: 'Engineering / CAD', value: 'engineering' },
          { label: 'General Use', value: 'general' },
        ],
        state,
      });
    }

    if (nextStep === 'budget') {
      return this._waitInput('budget', {
        prompt: 'What is the approved budget for this laptop?',
        choices: Object.entries(BUDGET_LABELS).map(([value, label]) => ({ label, value })),
        state,
      });
    }

    if (nextStep === 'priority') {
      return this._waitInput('priority', {
        prompt: 'What\'s the most important feature?',
        choices: [
          { label: 'Portability (lightweight, thin)', value: 'portability' },
          { label: 'Performance (fast CPU/GPU)', value: 'performance' },
          { label: 'Battery life', value: 'battery' },
          { label: 'Display quality', value: 'display' },
        ],
        state,
      });
    }

    if (nextStep === 'confirm') {
      const rec = recommendLaptop(state.use_case, state.budget, state.priority);
      const budgetLabel = BUDGET_LABELS[state.budget] || state.budget;
      const prompt = [
        `Based on your requirements, I recommend:\n`,
        `**${rec.name}** (${rec.price_range})`,
        `${rec.specs}`,
        ``,
        `Requirements summary:`,
        `• Beneficiary: ${state.beneficiary === 'myself' ? 'Yourself' : 'A colleague'}`,
        `• Use case: ${state.use_case}`,
        `• Budget: ${budgetLabel}`,
        `• Priority: ${state.priority}`,
        ``,
        `Shall I submit this laptop request?`,
      ].join('\n');

      return this._waitInput('confirm', {
        prompt,
        choices: [
          { label: 'Yes, submit request', value: 'yes' },
          { label: 'No, cancel', value: 'no' },
        ],
        state,
        recommendation: rec,
      });
    }

    // ── All stages complete ───────────────────────────────────────────────
    if (state.confirm === 'cancelled') {
      return this.success({
        branch: 'cancelled',
        message: 'Laptop request cancelled. Let me know if you need anything else.',
      });
    }

    const recommendation = recommendLaptop(state.use_case, state.budget, state.priority);
    return this.success({
      branch: 'confirmed',
      recommendation,
      requirements: {
        beneficiary: state.beneficiary,
        use_case: state.use_case,
        budget: state.budget,
        priority: state.priority,
      },
      message: `Laptop request submitted for **${recommendation.name}**.`,
    });
  }

  _waitInput(stage, { prompt, choices, state, recommendation = null }) {
    return {
      status: 'WAIT_FOR_INPUT',
      resume_token: randomUUID(),
      expected_inputs: ['userInput'],
      recipients: ['current_user'],
      prompt,
      choices,
      // Pass accumulated state back so next invocation has context
      accumulated_state: { ...state, stage },
      recommendation,
    };
  }

  _parseBeneficiary(input) {
    if (['myself', 'self', 'me', '1'].includes(input) || input.includes('myself') || input.includes('for me')) return 'myself';
    if (['colleague', 'other', 'another', '2'].includes(input) || input.includes('colleague') || input.includes('other')) return 'colleague';
    return null;
  }

  _parseUseCase(input) {
    if (input.includes('dev') || input.includes('code') || input.includes('programming') || input === '1') return 'development';
    if (input.includes('office') || input.includes('admin') || input.includes('word') || input === '2') return 'office';
    if (input.includes('design') || input.includes('creative') || input.includes('photo') || input === '3') return 'design';
    if (input.includes('engineer') || input.includes('cad') || input.includes('3d') || input === '4') return 'engineering';
    if (input.includes('general') || input.includes('browse') || input.includes('email') || input === '5') return 'general';
    return null;
  }

  _parseBudget(input) {
    if (input.includes('under') || input.includes('1000') || input === '1' || input.includes('under_1000')) return 'under_1000';
    if (input.includes('1000_1500') || input === '2' || (input.includes('1000') && input.includes('1500'))) return '1000_1500';
    if (input.includes('1500_2500') || input === '3' || (input.includes('1500') && input.includes('2500'))) return '1500_2500';
    if (input.includes('over') || input.includes('2500') || input === '4' || input.includes('over_2500')) return 'over_2500';
    return null;
  }

  _parsePriority(input) {
    if (input.includes('portable') || input.includes('portable') || input.includes('light') || input.includes('thin') || input === '1') return 'portability';
    if (input.includes('performance') || input.includes('fast') || input.includes('powerful') || input === '2') return 'performance';
    if (input.includes('battery') || input.includes('long') || input === '3') return 'battery';
    if (input.includes('display') || input.includes('screen') || input.includes('4k') || input === '4') return 'display';
    return null;
  }

  _parseConfirm(input) {
    if (['yes', 'y', 'submit', 'confirm', 'ok', '1'].includes(input) || input.includes('yes') || input.includes('submit')) return 'confirmed';
    if (['no', 'n', 'cancel', '2'].includes(input) || input.includes('no') || input.includes('cancel')) return 'cancelled';
    return null;
  }
}

module.exports = { LaptopAssistantExecutor, LAPTOP_CATALOG, recommendLaptop };
