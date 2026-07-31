/**
 * @guided-ux/tour — guided tours that ask the host what exists instead of assuming it.
 *
 * The core is framework-free and dependency-free ON PURPOSE. It touches no DOM, no
 * React, no database and no network: give it a scenario and a registry and it runs in
 * a plain Node test. Everything that does touch those lives behind a boundary —
 * `./react` for rendering, `./voice` for speech, a knowledge provider for content.
 *
 * That is not tidiness. It is the requirement: this has to run on somebody else's
 * site, where none of our infrastructure exists.
 *
 * ESM with no build step: a host adopting this changes nothing about their bundler.
 *
 * @module @guided-ux/tour/core
 */

export { AnchorRegistry } from './anchor-registry.js';
export { TourRunner } from './tour-runner.js';
export {
  validateScenario, anchorsOf, coverage, spokenSeconds,
  CHARS_PER_SECOND_SPOKEN, SPOKEN_SOFT_LIMIT, SPOKEN_HARD_LIMIT,
} from './scenario.js';
export { checkProvider, resilient as resilientProvider } from './knowledge-provider.js';
// Host Adapter Protocol v1.0 — how the tour asks an application to move.
export {
  createNavigator, checkAdapter, nullAdapter, safetyOf,
  ACTION_SAFETY, NAV_TYPES, INTERACT_TYPES, NO_CAPABILITIES,
} from './host-adapter.js';
