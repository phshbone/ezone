const { defineConfig, devices } = require('@playwright/test');

const mode = (process.env.LIVE_SMOKE_MODE || 'local').toLowerCase();
const isDeployed = mode === 'deployed';
const rawBaseURL = isDeployed
  ? process.env.LIVE_BASE_URL
  : process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';

if (isDeployed && !rawBaseURL) {
  throw new Error('LIVE_BASE_URL is required when LIVE_SMOKE_MODE=deployed.');
}

// A trailing slash is required so relative test paths remain inside GitHub Pages
// subfolder deployments such as /billstestpage/ezone-cleanup/.
const baseURL = rawBaseURL.endsWith('/') ? rawBaseURL : `${rawBaseURL}/`;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: isDeployed
    ? undefined
    : {
        command: 'python3 -m http.server 4173',
        url: `${baseURL}index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 15'],
        browserName: 'chromium',
      },
    },
  ],
});
