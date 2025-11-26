import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Custom plugin to conditionally set COEP headers for browser-based video generation
    {
      name: 'conditional-coep-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url || '', `http://${req.headers.host}`);
          const browserMode = url.searchParams.get('browserMode') === 'true';

          if (browserMode) {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      fs: path.resolve(__dirname, 'src/mocks/node-polyfills.js'),
      path: path.resolve(__dirname, 'src/mocks/node-polyfills.js'),
    }
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/videos': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
