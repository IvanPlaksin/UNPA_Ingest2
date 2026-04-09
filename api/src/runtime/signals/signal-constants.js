/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNAL CONSTANTS
 * Enums for the Universal Async Signal Contract system.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SignalType = {
  USER_INPUT: 'USER_INPUT',
  APPROVAL: 'APPROVAL',
  VOTE: 'VOTE',
  EXTERNAL_WEBHOOK: 'EXTERNAL_WEBHOOK',
  TIMER: 'TIMER',
  AI_DECISION: 'AI_DECISION',
};

const ResolutionMode = {
  SINGLE: 'SINGLE',
  QUORUM: 'QUORUM',
  VOTE: 'VOTE',
  FORCE: 'FORCE',
};

const TimeoutAction = {
  CONTINUE_DEFAULT: 'CONTINUE_DEFAULT',
  FAIL: 'FAIL',
  ESCALATE: 'ESCALATE',
  SKIP: 'SKIP',
};

const VoteResolutionStrategy = {
  MAJORITY: 'MAJORITY',
  WEIGHTED: 'WEIGHTED',
  UNANIMOUS: 'UNANIMOUS',
  CONDORCET: 'CONDORCET',
};

const TieBreakStrategy = {
  ESCALATE: 'ESCALATE',
  ABSTAIN: 'ABSTAIN',
  RANDOM: 'RANDOM',
  TIMEOUT_DEFAULT: 'TIMEOUT_DEFAULT',
};

const ParticipantType = {
  HUMAN_USER: 'HUMAN_USER',
  AI_AGENT: 'AI_AGENT',
  AI_AGENT_POOL: 'AI_AGENT_POOL',
  EXTERNAL_SYSTEM: 'EXTERNAL_SYSTEM',
};

module.exports = {
  SignalType,
  ResolutionMode,
  TimeoutAction,
  VoteResolutionStrategy,
  TieBreakStrategy,
  ParticipantType,
};
