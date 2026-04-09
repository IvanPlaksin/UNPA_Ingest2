/**
 * Async Signal System — Universal contract for GXE async waiting.
 */

const { AsyncSignalContract } = require('./async-signal-contract');
const {
  SignalType,
  ResolutionMode,
  TimeoutAction,
  VoteResolutionStrategy,
  TieBreakStrategy,
  ParticipantType,
} = require('./signal-constants');
const { TokenGenerator } = require('./token-generator');
const { VoteCollector } = require('./vote-collector');
const { ContradictionEvaluator, DOMAIN_RISK_MAP } = require('./contradiction-evaluator');
const { SignalOrchestrator } = require('./signal-orchestrator');

module.exports = {
  // Contract & enums
  AsyncSignalContract,
  SignalType,
  ResolutionMode,
  TimeoutAction,
  VoteResolutionStrategy,
  TieBreakStrategy,
  ParticipantType,
  // Components
  TokenGenerator,
  VoteCollector,
  ContradictionEvaluator,
  DOMAIN_RISK_MAP,
  // Orchestrator
  SignalOrchestrator,
};
