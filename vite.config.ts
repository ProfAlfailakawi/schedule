import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: { hmr: process.env.DISABLE_HMR !== 'true' },
  build: {
    // Route chunks are intentionally small; the warning would only be noise.
    chunkSizeWarningLimit: 700,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // One-time deployment namespace. It forces every browser to request a
        // fresh executable asset after the production recovery change instead
        // of reusing a previously cached/truncated JavaScript file.
        entryFileNames: 'assets/recovery-20260812-[name]-[hash].js',
        chunkFileNames: 'assets/recovery-20260812-[name]-[hash].js',
        assetFileNames: 'assets/recovery-20260812-[name]-[hash][extname]',
        // React and the icon set change far less often than product code, so
        // they get their own long-lived chunk instead of invalidating on every
        // release.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/lucide-react')) return 'icons';
        }
      }
    }
  }
});
