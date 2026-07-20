import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
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
