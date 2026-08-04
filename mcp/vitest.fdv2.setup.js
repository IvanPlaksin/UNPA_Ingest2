/**
 * Test setup for the flowdesk-chat-v2 suite.
 *
 * Two things jsdom does not give these tests on its own:
 *
 * 1. `toBeInTheDocument` and the rest of the DOM matchers — they come from
 *    @testing-library/jest-dom, which has to be registered with vitest's expect.
 *    Without it the assertions do not merely fail, they throw
 *    "Invalid Chai property", which reads like a broken test rather than a missing
 *    import.
 * 2. `Element.prototype.scrollIntoView` — unimplemented in jsdom. The message list
 *    scrolls itself to the newest message on every render, so every test that mounts
 *    it died on the call rather than on anything it was checking.
 */
import '@testing-library/jest-dom/vitest';

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
