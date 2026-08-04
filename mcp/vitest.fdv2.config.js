import { defineConfig } from 'vitest/config';

// Isolated test config for the flowdesk-chat-v2 feature. Avoids the repo-wide
// setupFiles, which pull in more than these tests need.
//
// The environment is jsdom because the suite outgrew its original description: it
// started as pure logic (mock fetch / EventSource) and now renders components and
// reads localStorage. Under `node` that half could not run at all — 52 of 107 tests
// failed on `localStorage is not defined` and friends, which is a broken suite rather
// than a failing one. jsdom and @testing-library/react are both installed.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.fdv2.setup.js'],
    include: ['src/features/flowdesk-chat-v2/**/*.{test,spec}.{js,jsx}'],
  },
});
