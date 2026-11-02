import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.test.ts', 'visual-motion/**/*.test.ts', 'study/**/*.test.ts'],
  workers: 1,
  timeout: 60000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: `artifacts/reports/${process.argv.some((arg) => arg.includes('tests/study')) ? 'dark-study' : process.argv.some((arg) => arg.includes('visual-motion')) ? 'motion' : 'e2e'}.json`,
      },
    ],
  ],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
