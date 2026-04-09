/**
 * GXE Runtime Control Flow
 *
 * Control flow components for conditional branching and loops.
 *
 * @module runtime/control
 */

const {
  ConditionalBranch,
  createIfElse,
  createSwitch,
  createRangeBranch
} = require('./ConditionalBranch');

const {
  LoopPattern,
  LoopType,
  LoopState,
  createForEach,
  createWhile,
  createDoWhile,
  createCountLoop
} = require('./LoopPattern');

module.exports = {
  // Conditional branching
  ConditionalBranch,
  createIfElse,
  createSwitch,
  createRangeBranch,

  // Loop patterns
  LoopPattern,
  LoopType,
  LoopState,
  createForEach,
  createWhile,
  createDoWhile,
  createCountLoop
};
