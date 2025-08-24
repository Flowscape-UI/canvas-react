import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'storybook-static/**', 'e2e/**'],
    environment: 'jsdom',
    setupFiles: ['src/test.setup.ts'],
  },
});
