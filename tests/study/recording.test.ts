import { test, expect } from '../fixtures/clean';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('gravação real: quatro coreografias em cerca de dois segundos', async ({
  studyApp,
  studyPage,
}, testInfo) => {
  test.setTimeout(45000);
  const directory = resolve('artifacts/recording/choreography');
  await mkdir(directory, { recursive: true });
  // Captura somente a janela sintética do Krono, nunca a área de trabalho.
  await studyApp.evaluate(async ({ BrowserWindow }, folder) => {
    const { writeFileSync } = process.getBuiltinModule('node:fs');
    const window = BrowserWindow.getAllWindows()[0];
    window.showInactive();
    const started = Date.now();
    const frames: { name: string; time: number }[] = [];
    let last = 0;
    window.webContents.beginFrameSubscription(false, (image) => {
      const now = Date.now();
      if (now - last < 45) return;
      last = now;
      const name = `frame-${String(frames.length).padStart(4, '0')}.png`;
      writeFileSync(
        `${folder}/${name}`,
        image.crop({ x: 0, y: 0, width: image.getSize().width, height: 88 }).toPNG(),
      );
      frames.push({ name, time: now - started });
    });
    (globalThis as unknown as { recording: { started: number; frames: typeof frames } }).recording =
      { started, frames };
  }, directory);
  const measurements = [];
  const nav = studyPage.getByRole('navigation');
  for (const name of ['Perfil', 'Foco', 'Hábitos', 'Produção']) {
    await nav.getByRole('button', { name, exact: true }).click();
    const result = await studyPage.evaluate(async () => {
      const animations = document
        .getAnimations()
        .filter((animation) => animation.id.startsWith('krono-'));
      const primary = animations.reduce((longest, next) =>
        Number(next.effect!.getTiming().duration) + Number(next.effect!.getTiming().delay) >
        Number(longest.effect!.getTiming().duration) + Number(longest.effect!.getTiming().delay)
          ? next
          : longest,
      );
      await primary.ready;
      const start = primary.startTime as number;
      const samples = [];
      for (const moment of [250, 700, 1250, 1750]) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.max(0, moment - Number(primary.currentTime))),
        );
        samples.push({
          time: primary.currentTime,
          transform: getComputedStyle((primary.effect as KeyframeEffect).target!).transform,
        });
      }
      await primary.finished;
      return { elapsed: Number(document.timeline.currentTime) - start, samples };
    });
    expect(result.elapsed).toBeGreaterThanOrEqual(1800);
    expect(result.elapsed).toBeLessThanOrEqual(2200);
    expect(new Set(result.samples.map((sample) => sample.transform)).size).toBeGreaterThan(2);
    measurements.push({ name, ...result });
    await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  const recording = await studyApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.endFrameSubscription();
    window.hide();
    const value = (
      globalThis as unknown as {
        recording: { started: number; frames: { name: string; time: number }[] };
      }
    ).recording;
    return { ...value, ended: Date.now() - value.started };
  });
  expect(recording.frames.length).toBeGreaterThan(45);
  await writeFile(
    `${directory}/timeline.json`,
    JSON.stringify({ ...recording, measurements }, null, 2),
  );
  await testInfo.attach('duração-efetiva', {
    body: JSON.stringify(measurements),
    contentType: 'application/json',
  });
});
