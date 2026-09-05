import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * UI-interaction test harness.
 *
 * Runs the REAL student-facing React components in a jsdom DOM and drives
 * them with real browser-like events (clicks, typing). `fetch` is bridged to
 * the live local FastAPI backend, so these tests exercise the complete chain:
 *
 *   DOM event → component state → API client → real HTTP → FastAPI →
 *   SQLite → server grading → response → locked UI
 *
 * The sandbox this repo is developed in has no installable real browser, so
 * jsdom is the closest available runtime simulation (documented in the report).
 *
 * Requires the backend running on http://127.0.0.1:8000 (SQLite dev DB).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
