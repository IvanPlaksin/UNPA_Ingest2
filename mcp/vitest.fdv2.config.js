import { defineConfig } from 'vitest/config';

// Isolated test config for the flowdesk-chat-v2 feature. Avoids the repo-wide
// setupFiles (which import @testing-library/react → @testing-library/dom, not
// installed). These feature tests are pure logic (mock fetch / EventSource) and
// need neither jsdom nor testing-library.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: ['src/features/flowdesk-chat-v2/**/*.{test,spec}.{js,jsx}'],
  },
});
