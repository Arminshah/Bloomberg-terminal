// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { defineConfig } from '@playwright/test';

// This exercises the packaged desktop IPC boundary, separately from the browser demo suite.
// Build dist first (npm run e2e:desktop). Linux needs a display, such as xvfb-run.
export default defineConfig({
  testDir: './desktop-e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/desktop',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
