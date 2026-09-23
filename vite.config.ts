/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for the production build (`npm run preview`).
 * The dev server is excluded because React Fast Refresh injects an inline
 * preamble script. The production bundle has no inline scripts, so
 * `script-src 'self'` holds. A real deployment sets this header at the edge.
 */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' wss: ws:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  preview: {
    headers: {
      'Content-Security-Policy': PRODUCTION_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
