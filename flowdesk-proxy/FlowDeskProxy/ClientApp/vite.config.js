import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3004,
    proxy: {
      '/proxy': 'http://localhost:9000',
      '/hubs': {
        target: 'http://localhost:9000',
        ws: true,
      },
      '/api': 'http://localhost:9000',
    },
  },
  build: {
    outDir: '../wwwroot',
    emptyOutDir: true,
  },
});
