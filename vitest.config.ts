import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Separate config so `vite build`/`vite dev` keep using vite.config.ts
// (which contains the Figma Make dev-only plugins).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true, // enables @testing-library/react automatic cleanup
    restoreMocks: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
