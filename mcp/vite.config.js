import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// @guided-ux/tour lives in the monorepo, not in node_modules. It is plain ESM with no
// build step, so an alias is all it needs — that portability is the whole point of the
// package, and needing a bundler config here would disprove it.
const guidedUx = path.resolve(here, '../packages/guided-ux')

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
        alias: {
            '@guided-ux/tour': guidedUx,
        },
    },
    optimizeDeps: {
        // @flowdesk/chat-v2 pinned so a local rebuild is re-optimized. (v1.0.9)
        include: [
            'elkjs/lib/elk.bundled.js',
            '@react-three/fiber',
            '@react-three/drei',
            '@react-three/postprocessing',
            'three',
            '@flowdesk/chat-v2',
        ],
    },
    server: {
        host: true,
        port: 5173,
        // The package sits outside this app's root; without this the dev server
        // refuses to serve it.
        fs: { allow: [here, guidedUx] },
        proxy: {
            '/api': {
                target: 'http://localhost:3010',
                changeOrigin: true,
            }
        }
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
        exclude: ['node_modules', 'dist', 'src/components/Forms/__tests__/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/hooks/**', 'src/utils/**', 'src/components/common/**']
        },
        testTimeout: 10000,
        reporters: ['verbose']
    }
})
