import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev:api', url: 'http://localhost:8787/api/health', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
