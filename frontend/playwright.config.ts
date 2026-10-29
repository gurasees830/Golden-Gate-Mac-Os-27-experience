import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  // PW_CHANNEL=chrome (or msedge) runs the tests in an installed browser instead of Playwright's download
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
});
