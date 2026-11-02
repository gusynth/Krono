/* global process, console, require */
/* eslint-disable @typescript-eslint/no-require-imports -- Fixture Node CJS guardada para Sandbox. */
// Opt-in: dados sintéticos; recusa execução fora do usuário do Sandbox.
if (
  process.env.USERNAME !== 'WDAGUtilityAccount' ||
  require('node:path').resolve(process.env.USERPROFILE ?? '') !==
    require('node:path').resolve('C:/Users/WDAGUtilityAccount')
)
  throw Error('SANDBOX_ONLY');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
(async () => {
  const install = path.join(process.env.LOCALAPPDATA, 'Programs', 'Krono'),
    profile = path.join(process.env.APPDATA, 'Krono');
  fs.mkdirSync(path.join(profile, 'data'), { recursive: true });
  const worker = new Worker(
    path.join(install, 'resources', 'app.asar', 'dist-electron', 'worker.cjs'),
    { workerData: { path: path.join(profile, 'data', 'krono.sqlite') } },
  );
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    worker.on('error', reject);
    worker.on('message', (m) => {
      if (m.kind === 'ready') resolve();
      else if (m.id) {
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          if (m.ok) p.resolve(m.value);
          else p.reject(Error('worker request failed'));
        }
      }
    });
  });
  const request = (type, value) =>
    new Promise((resolve, reject) => {
      const current = ++id;
      pending.set(current, { resolve, reject });
      worker.postMessage({ id: current, type, value });
    });
  const now = Date.now(),
    context = { now, timezone: 'UTC' };
  if (process.argv[2] === 'seed') {
    const habits = await request('habits:read', context);
    if (!habits.habits.some((h) => h.name === 'Sandbox preservation 18')) {
      const reply = await request('habits:command', {
        ...context,
        command: {
          commandId: crypto.randomUUID(),
          expectedRevision: habits.revision,
          action: 'create',
          habitId: crypto.randomUUID(),
          input: {
            name: 'Sandbox preservation 18',
            kind: 'action',
            frequency: { kind: 'daily' },
            targetMinutes: 1,
          },
        },
      });
      if (reply.code !== 'ok') throw Error('seed habit');
    }
    const prefs = await request('desktop:preferences');
    await request('desktop:update', {
      expectedRevision: prefs.revision,
      patch: { profile: { name: 'Sandbox 18', avatar: 'brasa', onboarded: true } },
    });
  }
  const habits = await request('habits:read', context),
    prefs = await request('desktop:preferences');
  console.log(
    JSON.stringify({
      ids: habits.habits.map((h) => h.id),
      names: habits.habits.map((h) => h.name),
      profile: prefs.profile,
    }),
  );
  await request('close');
  await worker.terminate();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
