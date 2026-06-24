import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'android-chrome-size',
      use: {
        ...devices['Pixel 5']
      }
    },
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
