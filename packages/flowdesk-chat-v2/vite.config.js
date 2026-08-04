import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { copyFileSync } from 'node:fs';

/** The typings are hand-written (the sources are JSX), so just publish them. */
function copyTypes() {
  return {
    name: 'copy-types',
    closeBundle() {
      copyFileSync(
        fileURLToPath(new URL('src/index.d.ts', import.meta.url)),
        fileURLToPath(new URL('dist/index.d.ts', import.meta.url))
      );
    },
  };
}

/**
 * Library build for @flowdesk/chat-v2.
 *
 * Only react/react-dom are external — everything else (zustand, i18next,
 * react-markdown …) is bundled, so a host installs the component and gets
 * nothing else to reconcile. That matters most for a `file:` install, where the
 * package's own dependency tree does not hoist into the host's node_modules.
 */
export default defineConfig({
  plugins: [react(), copyTypes()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.js', import.meta.url)),
      name: 'FlowDeskChatV2',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'flowdesk-chat-v2.js' : 'flowdesk-chat-v2.cjs'),
      cssFileName: 'flowdesk-chat-v2',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      output: {
        // The entry deliberately exposes both a default and named exports;
        // 'named' keeps CJS interop explicit (require(...).default).
        exports: 'named',
        globals: { react: 'React', 'react-dom': 'ReactDOM' },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    emptyOutDir: true,
    target: 'es2020',
  },
});
