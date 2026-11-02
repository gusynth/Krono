// Fixture externa: somente o perfil da cópia descartável, antes de iniciar sua UI.
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStorage } from '../../electron/storage/client';
import { workerTimerRepository } from '../../electron/storage/timer-client';
import { workerDesktopRepository } from '../../electron/storage/desktop-client';
import { TimerService } from '../../electron/services/TimerService';
const root = resolve(process.env.KRONO_NATIVE_ROOT ?? ''),
  location = relative(resolve('.test-data'), root);
if (
  !location ||
  location.startsWith('..') ||
  isAbsolute(location) ||
  !existsSync(join(root, 'native-test.marker'))
)
  throw new Error('FIXTURE_ONLY');
async function seed() {
  const profile = join(root, '.test-data/development');
  const worker = await openStorage(
    join(root, 'dist-electron/worker.cjs'),
    join(profile, 'data/krono.sqlite'),
  );
  const client = workerTimerRepository(worker),
    desktop = workerDesktopRepository(client.request);
  const timer = new TimerService(
    client,
    { civil: () => Date.now(), monotonic: () => performance.now() },
    'America/Sao_Paulo',
  );
  try {
    await timer.initialize();
    const preferences = await desktop.preferences();
    await desktop.update({
      expectedRevision: preferences.revision,
      patch: { volume: 0.2, soundEnabled: true, notificationsEnabled: true },
    });
    await timer.command({
      commandId: randomUUID(),
      expectedRevision: timer.read().revision,
      sessionId: null,
      action: 'start',
      preset: { focusMs: 30000, shortBreakMs: 5000, longBreakMs: 15000, longEvery: 4 },
    });
    writeFileSync(
      join(root, 'seed-result.json'),
      JSON.stringify({
        syntheticPreset: true,
        presetMs: 30000,
        sessionId: timer.read().sessionId,
        snapshotElapsedMs: timer.read().elapsedMs,
      }),
    );
  } finally {
    timer.dispose();
    await client.request('close');
    client.dispose();
    await worker.terminate();
  }
}
void seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
