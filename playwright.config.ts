import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:6007',
    headless: true,
  },
  webServer: {
    command: 'bunx http-server storybook-static -p 6007 -s',
    url: 'http://localhost:6007',
    reuseExistingServer: !process.env.CI,
  },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
