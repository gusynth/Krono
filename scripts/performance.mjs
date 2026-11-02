/* global window, document, performance, clearTimeout, requestAnimationFrame, crypto */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  lstat,
  copyFile,
  rm,
  realpath,
} from 'node:fs/promises';
import { resolve, join, dirname, basename, relative } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { build } from 'esbuild';
import electron from 'electron';
import { _electron } from '@playwright/test';

await mkdir('.test-data/performance', { recursive: true });
await mkdir('artifacts/reports', { recursive: true });
const repeat = process.argv.includes('--repeat-fixture'),
  marker = 'Krono synthetic performance fixture v1';
const profile = repeat
  ? resolve(JSON.parse(await readFile('.test-data/performance/last-fixture.json', 'utf8')).profile)
  : await mkdtemp(resolve('.test-data/performance-profile-'));
assert.equal(dirname(profile), resolve('.test-data'));
assert.match(basename(profile), /^performance-profile-[\w-]+$/);
assert.equal(await realpath(profile), profile);
assert.equal((await lstat(profile)).isSymbolicLink(), false);
if (repeat) {
  assert.equal(await readFile(join(profile, 'fixture.marker'), 'utf8'), marker);
  assert.equal((await lstat(join(profile, 'data'))).isSymbolicLink(), false);
  assert.equal((await lstat(join(profile, 'reference.sqlite'))).isSymbolicLink(), false);
  // Só o conjunto de teste marcado, nunca um perfil arbitrário; original imutável mantido.
  for (const suffix of ['', '-wal', '-shm', '-journal'])
    await rm(join(profile, `data/krono.sqlite${suffix}`), { force: true });
  await copyFile(join(profile, 'reference.sqlite'), join(profile, 'data/krono.sqlite'));
} else {
  await mkdir(join(profile, 'data'));
  await writeFile(join(profile, 'fixture.marker'), marker);
}
await writeFile(
  '.test-data/performance/last-fixture.json',
  JSON.stringify({ profile: relative(process.cwd(), profile) }),
);
const common = { bundle: true, platform: 'node', external: ['electron', 'better-sqlite3'] };
await build({
  ...common,
  entryPoints: ['tests/fixtures/performance-database.ts'],
  outfile: '.test-data/performance/database.mjs',
  format: 'esm',
});
const baselineCode = spawnSync('git', ['show', 'HEAD:electron/storage/production-repository.ts'], {
    encoding: 'utf8',
  }),
  baselineCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
if (baselineCode.status !== 0 || baselineCommit.status !== 0)
  throw new Error('BASELINE_SOURCE_UNAVAILABLE');
await build({
  ...common,
  entryPoints: ['tests/fixtures/performance-database.ts'],
  outfile: '.test-data/performance/database-baseline.mjs',
  format: 'esm',
  plugins: [
    {
      name: 'repository-at-head',
      setup(builder) {
        builder.onLoad(
          { filter: /[\\/]electron[\\/]storage[\\/]production-repository\.ts$/ },
          () => ({
            contents: baselineCode.stdout,
            loader: 'ts',
            resolveDir: resolve('electron/storage'),
          }),
        );
      },
    },
  ],
});
await build({
  ...common,
  entryPoints: ['tests/fixtures/performance-harness.ts'],
  outfile: '.test-data/performance/main.mjs',
  format: 'esm',
});
// Contador de listeners somente no preload externo de teste; nada é adicionado ao produto.
const banner = `const { ipcRenderer: fixtureIPC, contextBridge: fixtureBridge } = require('electron'); fixtureBridge.exposeInMainWorld('fixtureListeners', () => Object.fromEntries(['timer:snapshot','desktop:snapshot','desktop:focus','production:changed','shell-dialog:changed'].map(name => [name, fixtureIPC.listenerCount(name)])));`;
await build({
  ...common,
  entryPoints: ['electron/preload.ts'],
  outfile: '.test-data/performance/preload.cjs',
  format: 'cjs',
  banner: { js: banner },
});
await writeFile(
  '.test-data/performance/package.json',
  JSON.stringify({
    name: 'krono-performance-test',
    version: JSON.parse(await readFile('package.json', 'utf8')).version,
    main: 'main.mjs',
  }),
);
const baselineRun = spawnSync(
  electron,
  [resolve('.test-data/performance/database-baseline.mjs'), profile],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      KRONO_BENCHMARK_EXISTING: repeat ? '1' : '0',
    },
  },
);
if (baselineRun.status !== 0) throw new Error('BASELINE_FIXTURE_FAILED');
const baseline = {
  commit: baselineCommit.stdout.trim(),
  repositoryAtHeadWithCurrentSharedHelpers: JSON.parse(
    await readFile(join(profile, 'database-report.json'), 'utf8'),
  ),
};
const fixture = spawnSync(electron, [resolve('.test-data/performance/database.mjs'), profile], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', KRONO_BENCHMARK_EXISTING: '1' },
});
if (fixture.status !== 0) throw new Error('DATABASE_FIXTURE_FAILED');
if (!repeat) await copyFile(join(profile, 'data/krono.sqlite'), join(profile, 'reference.sqlite'));
const hash = createHash('sha256');
for await (const chunk of createReadStream(join(profile, 'reference.sqlite'))) hash.update(chunk);
const referenceDigest = hash.digest('hex');
if (process.argv.includes('--database-only')) {
  console.log(
    JSON.stringify({
      baseline,
      current: JSON.parse(await readFile(join(profile, 'database-report.json'), 'utf8')),
    }),
  );
  process.exit(0);
}
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
    ),
  ),
  KRONO_PERFORMANCE_PROFILE: profile,
};
const report = {
  timestamp: new Date().toISOString(),
  fixture: relative(process.cwd(), profile),
  referenceDigest,
  repeatedFixture: repeat,
  conditions:
    'Synthetic isolated marked profile with immutable reference retained; same database for repository HEAD/current comparison, current shared helpers in both; warm OS cache uncontrolled; no concurrent test suites; visible controlled renderer then separate debugger-free hidden process; no tray/toast/audio/native DPI or energy sensor claim',
  hardware: { cpu: cpus()[0].model, logicalCPUs: cpus().length, ramBytes: totalmem() },
  baseline,
  database: JSON.parse(await readFile(join(profile, 'database-report.json'), 'utf8')),
};
const app = await _electron.launch({ args: [resolve('.test-data/performance')], env });
let appClosed = false;
try {
  const page = await app.firstWindow();
  await page.getByRole('navigation').getByRole('button', { name: 'Foco', exact: true }).click();
  await page.getByRole('heading', { name: 'Foco', exact: true }).waitFor();
  await page.waitForFunction(() => typeof window.fixtureListeners === 'function');
  report.startup = await app.evaluate(() => ({
    startupMs: globalThis.performanceFixture.startupMs,
    dataset: globalThis.performanceFixture.dataset,
    runtime: process.versions,
  }));
  report.ipcRoundtripMs = await page.evaluate(async () => {
    const times = [];
    for (let index = 0; index < 6; index++) {
      const start = performance.now(),
        value = await window.krono.production.read({
          days: 365,
          endDate: '2025-12-31',
          habitId: null,
        });
      if (value.metrics.eligibleMs !== 4_800_000_000 || value.history.length !== 20)
        throw new Error('INCORRECT_RESULT');
      times.push(performance.now() - start);
    }
    return times;
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () =>
    Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((item) => [item.name, item.value]),
    );
  const snapshot = async () => ({
    cdp: await metrics(),
    document: await page.evaluate(() => ({
      nodes: document.querySelectorAll('*').length,
      listeners: window.fixtureListeners(),
      animations: document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' && !['ambient-drift', 'mineral-light-ambient'].includes(a.id),
        ).length,
      ambientAnimations: document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' && ['ambient-drift', 'mineral-light-ambient'].includes(a.id),
        ).length,
    })),
    workerListeners: await app.evaluate(() => globalThis.performanceFixture.workerListeners()),
  });
  const navigate = async (name) => {
    await page
      .getByRole('navigation')
      .getByRole('button', { name, exact: true })
      .evaluate((button) => button.click());
    await page.getByRole('heading', { name, exact: true }).waitFor();
  };
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].showInactive();
  });
  await page.waitForFunction(() => document.visibilityState === 'visible');
  // Aquecer todas as rotas e aguardar leituras antes do baseline, sem contar animações como leak.
  await navigate('Hábitos');
  await page.locator('.habit-record').last().waitFor();
  await navigate('Produção');
  await page.waitForFunction(
    () =>
      document.querySelector('.production-metrics') &&
      document.querySelector('.production-route')?.getAttribute('aria-busy') === 'false',
  );
  await navigate('Foco');
  await wait(2200);
  await cdp.send('HeapProfiler.collectGarbage');
  report.before = await snapshot();
  await app.evaluate(async ({ contentTracing }) => {
    await contentTracing.startRecording({ included_categories: ['devtools.timeline'] });
  });
  for (let index = 0; index < 30; index++)
    await navigate(['Hábitos', 'Produção', 'Foco'][index % 3]);
  // Esperar o mesmo estado carregado do baseline: conteúdo novo não é vazamento.
  await navigate('Produção');
  await page.waitForFunction(
    () =>
      document.querySelector('.production-metrics') &&
      document.querySelector('.production-route')?.getAttribute('aria-busy') === 'false',
  );
  await navigate('Foco');
  await wait(2200);
  await cdp.send('HeapProfiler.collectGarbage');
  report.after = await snapshot();
  const tracePath = resolve('artifacts/reports/performance-trace.json');
  await app.evaluate(async ({ contentTracing }, path) => {
    await contentTracing.stopRecording(path);
  }, tracePath);
  const trace = JSON.parse(await readFile(tracePath, 'utf8'));
  const paint = trace.traceEvents.filter((event) => event.name === 'Paint' && event.ph === 'X');
  report.paint = {
    events: paint.length,
    totalDurationMs: paint.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000,
    meaning: 'Sum of captured Paint events; not FPS, GPU time or total energy',
  };
  report.renderer = {
    scriptSeconds: report.after.cdp.ScriptDuration - report.before.cdp.ScriptDuration,
    layoutSeconds: report.after.cdp.LayoutDuration - report.before.cdp.LayoutDuration,
    taskSeconds: report.after.cdp.TaskDuration - report.before.cdp.TaskDuration,
    heapDeltaBytes: report.after.cdp.JSHeapUsedSize - report.before.cdp.JSHeapUsedSize,
    domDelta: report.after.document.nodes - report.before.document.nodes,
  };
  assert.deepEqual(report.after.document.listeners, report.before.document.listeners);
  assert.deepEqual(report.after.workerListeners, report.before.workerListeners);
  assert.equal(report.after.document.animations, 0);
  assert.ok(report.renderer.domDelta <= 10, 'DOM grew after warm navigation');
  assert.ok(
    report.renderer.heapDeltaBytes < 4 * 1024 * 1024,
    'Heap grew above local diagnostic budget after collection',
  );
  // Menus repetidos: comparar o mesmo estado assentado, sem confundir caches com leaks.
  for (let index = 0; index < 12; index++) {
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Sobre', exact: true }).click();
    await page.getByRole('button', { name: 'Fechar ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Configuração do preset', exact: true }).click();
    await page.keyboard.press('Escape');
  }
  await wait(2200);
  await cdp.send('HeapProfiler.collectGarbage');
  report.afterMenus = await snapshot();
  assert.deepEqual(report.afterMenus.document.listeners, report.before.document.listeners);
  assert.deepEqual(report.afterMenus.workerListeners, report.before.workerListeners);
  assert.ok(
    report.afterMenus.document.nodes - report.before.document.nodes <= 10,
    'DOM grew after repeated menus',
  );
  report.activeSamples = [];
  await page.getByRole('button', { name: 'Iniciar foco', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor();
  const session = await page.evaluate(async () => (await window.krono.timer.read()).sessionId);
  for (const mode of ['focus', 'mini']) {
    if (mode === 'mini')
      await page.getByRole('button', { name: 'Mini timer', exact: true }).click();
    await wait(2200);
    await app.evaluate(({ app }) => app.getAppMetrics());
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await wait(3000);
      samples.push(
        await app.evaluate(({ app }) =>
          app.getAppMetrics().map((item) => ({
            type: item.type,
            cpuPercent: item.cpu.percentCPUUsage,
            privateKB: item.memory.privateBytes,
            workingSetKB: item.memory.workingSetSize,
          })),
        ),
      );
    }
    const state = await page.evaluate(async () => window.krono.timer.read());
    assert.equal(state.sessionId, session);
    assert.equal(state.state, 'running');
    const animations = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => a.id),
    );
    if (mode === 'mini') assert.equal(animations.length, 0, 'Mini must have static ambient');
    report.activeSamples.push({
      mode,
      samples,
      sessionId: state.sessionId,
      elapsedMs: state.elapsedMs,
      animations,
      windows: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    });
  }
  await page.getByRole('button', { name: 'Voltar à janela completa', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  report.sidebarFrames = await page.evaluate(async () => {
    const toggle = document.querySelector('.navigation-toggle');
    if (!toggle) throw new Error('SIDEBAR_FIXTURE_UNAVAILABLE');
    const intervals = [];
    let last = performance.now(),
      start = last,
      flips = 0;
    await new Promise((resolve) => {
      const frame = (now) => {
        intervals.push(now - last);
        last = now;
        if (flips < 6 && now - start >= flips * 450) {
          toggle.click();
          flips++;
        }
        if (now - start < 3000) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    intervals.sort((a, b) => a - b);
    return {
      flips,
      samples: intervals.length,
      medianMs: intervals[Math.floor(intervals.length * 0.5)],
      p95Ms: intervals[Math.floor(intervals.length * 0.95)],
      over32ms: intervals.filter((ms) => ms > 32).length,
      meaning: 'Intervalos rAF durante seis recolhimentos; não mede GPU ou energia',
    };
  });
  // Comparação do fundo no mesmo processo/dataset; ordem fixa e cache/carga do SO não controlados.
  report.ambientSamples = [];
  for (const mode of ['static', 'animated', 'disabled']) {
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Aparência', exact: true }).click();
    await page
      .getByRole('switch', { name: 'Reduzir animações', exact: true })
      .setChecked(mode === 'static');
    await page
      .getByRole('switch', { name: 'Fundo ambiente', exact: true })
      .setChecked(mode !== 'disabled');
    await page.getByRole('button', { name: 'Fechar ajustes', exact: true }).click();
    await wait(2200);
    await app.evaluate(({ app }) => app.getAppMetrics());
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await wait(3000);
      samples.push(
        await app.evaluate(({ app }) =>
          app.getAppMetrics().map((item) => ({
            type: item.type,
            cpuPercent: item.cpu.percentCPUUsage,
            privateKB: item.memory.privateBytes,
            workingSetKB: item.memory.workingSetSize,
          })),
        ),
      );
    }
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const values = [],
            started = performance.now();
          let previous = started;
          const frame = (now) => {
            values.push(now - previous);
            previous = now;
            if (now - started < 1500) requestAnimationFrame(frame);
            else {
              const sorted = values.slice(1).sort((a, b) => a - b);
              resolve({
                count: sorted.length,
                medianMs: sorted[Math.floor(sorted.length * 0.5)],
                p95Ms: sorted[Math.floor(sorted.length * 0.95)],
                over32ms: sorted.filter((n) => n > 32).length,
              });
            }
          };
          requestAnimationFrame(frame);
        }),
    );
    report.ambientSamples.push({
      mode,
      samples,
      frames,
      animations: await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running')
          .map((a) => a.id),
      ),
    });
  }
  await page.evaluate(async () => {
    const api = window.krono.timer,
      state = await api.read();
    await api.command({
      commandId: crypto.randomUUID(),
      expectedRevision: state.revision,
      sessionId: state.sessionId,
      action: 'cancel',
    });
  });
  await wait(2200);
  await cdp.send('HeapProfiler.collectGarbage');
  report.finalSnapshot = await snapshot();
  await app.close();
  appClosed = true;
  await rm(join(profile, 'hidden-report.json'), { force: true });
  const hidden = spawn(electron, [resolve('.test-data/performance')], {
    env: { ...env, KRONO_PERFORMANCE_UNCONTROLLED: '1' },
    stdio: 'inherit',
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      hidden.kill();
      reject(new Error('HIDDEN_PROCESS_TIMEOUT'));
    }, 90000);
    hidden.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    hidden.once('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`HIDDEN_PROCESS_EXIT_${code}`));
    });
  });
  report.hidden = JSON.parse(await readFile(join(profile, 'hidden-report.json'), 'utf8'));
  assert.equal(report.hidden.result, 'passed');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await writeFile('artifacts/reports/performance.json', JSON.stringify(report, null, 2));
  if (!appClosed) await app.close();
}
console.log(
  JSON.stringify(
    {
      result: report.result,
      renderer: report.renderer,
      paint: report.paint,
      hidden: report.hidden,
    },
    null,
    2,
  ),
);
