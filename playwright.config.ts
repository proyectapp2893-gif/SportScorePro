import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: { baseURL, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  // Keep E2E isolated from a developer's Next.js process on port 3000.
  // Reusing an existing server can otherwise execute stale bundles.
  webServer: { command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
