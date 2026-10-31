// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { defineConfig, devices } from '@playwright/test';

// A Chromium other than Playwright's own (the cloud sandbox's newer build) draws text differently, so screenshot
// baselines are kept per browser: Playwright's Chromium, as CI runs it, and the sandbox's.
const ownChromium = !!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-platform}${ownChromium ? '-own-chromium' : ''}{ext}`,
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1600, height: 1000 },
    // Cloud tasks may already provide Chromium. Leave unset to use Playwright's managed browser.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
