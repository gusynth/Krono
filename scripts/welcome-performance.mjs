/* global document, window, localStorage, performance, requestAnimationFrame */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { _electron } from '@playwright/test';
import { build } from 'esbuild';
const harness = resolve('.test-data/welcome-performance');
await mkdir(harness, { recursive: true });
await build({
  entryPoints: ['tests/fixtures/electron-harness.ts'],
  outfile: resolve(harness, 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['electron', 'better-sqlite3'],
});
await writeFile(
  resolve(harness, 'package.json'),
  JSON.stringify({
    name: 'krono-welcome-performance',
    version: JSON.parse(await readFile('package.json', 'utf8')).version,
    main: 'main.mjs',
  }),
);
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
    ),
  ),
  KRONO_TEST_WELCOME: '1',
};
const app = await _electron.launch({ args: [harness], env });
const report = {
  timestamp: new Date().toISOString(),
  cpu: cpus()[0].model,
  conditions:
    'Isolated synthetic first-access harness; mocked global shortcut/tray/notification ports; same process and fixed static/animated/disabled order; Playwright attached throughout; OS cache/load uncontrolled. Not energy, native installation or universal FPS/RAM certification.',
  samples: [],
};
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1280, 900);
    w.showInactive();
  });
  for (const mode of ['static', 'animated', 'disabled']) {
    await page.evaluate(
      (mode) =>
        localStorage.setItem(
          'krono.appearance.v1',
          JSON.stringify({
            reducedMotion: mode === 'static',
            reducedEffects: false,
            ambient: mode !== 'disabled',
            theme: 'original',
            shortcut: 'off',
          }),
        ),
      mode,
    );
    await page.reload();
    await page.getByRole('dialog', { name: 'Conheça o Krono', exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Conhecer o Krono', exact: true }).count())
      await page.getByRole('button', { name: 'Conhecer o Krono', exact: true }).click();
    await page.evaluate(async () =>
      Promise.all([...document.images].map((image) => image.decode().catch(() => {}))),
    );
    await wait(2200);
    await app.evaluate(({ app }) => app.getAppMetrics());
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await wait(2500);
      samples.push(
        await app.evaluate(({ app }) =>
          app.getAppMetrics().map((p) => ({
            type: p.type,
            cpu: p.cpu.percentCPUUsage,
            privateKB: p.memory.privateBytes,
            workingSetKB: p.memory.workingSetSize,
          })),
        ),
      );
    }
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const values = [],
            start = performance.now();
          let last = start;
          function frame(now) {
            values.push(now - last);
            last = now;
            if (now - start < 1200) requestAnimationFrame(frame);
            else {
              const sorted = values.slice(1).sort((a, b) => a - b);
              resolve({
                count: sorted.length,
                medianMs: sorted[Math.floor(sorted.length * 0.5)],
                p95Ms: sorted[Math.floor(sorted.length * 0.95)],
                over32ms: sorted.filter((n) => n > 32).length,
              });
            }
          }
          requestAnimationFrame(frame);
        }),
    );
    const animations = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => a.id),
    );
    assert.deepEqual(animations, mode === 'animated' ? ['ambient-drift'] : []);
    report.samples.push({ mode, samples, frames, animations });
  }
  await page.getByRole('button', { name: 'Pular apresentação', exact: true }).click();
  assert.equal(await page.locator('.introduction-screen img').count(), 0);
  assert.equal(await page.evaluate(async () => (await window.krono.timer.read()).sessionId), null);
  report.afterClose = {
    tutorialImages: await page.locator('.introduction-screen img').count(),
    windows: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  };
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await mkdir('artifacts/reports', { recursive: true });
  await writeFile('artifacts/reports/welcome-performance.json', JSON.stringify(report, null, 2));
  await app.close();
}
console.log(JSON.stringify({ result: report.result, afterClose: report.afterClose }));
