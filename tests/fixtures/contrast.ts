import type { Page } from '@playwright/test';

export async function contrast(page: Page, selectors: string[]) {
  const samples = await page.evaluate(
    (list) =>
      list.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter((el) => el.checkVisibility())
          .map((element) => {
            const style = getComputedStyle(element),
              box = element.getBoundingClientRect(),
              color = style.color.match(/[\d.]+/g)!.map(Number);
            const original = element.getAttribute('style');
            element.dataset.contrastOriginal = original ?? '';
            element.style.setProperty('color', 'transparent', 'important');
            return {
              selector,
              text: element.textContent?.trim(),
              color,
              box: { x: box.x, y: box.y, width: box.width, height: box.height },
            };
          }),
      ),
    selectors,
  );
  let buffer: Buffer;
  try {
    buffer = await page.screenshot({ scale: 'css', animations: 'disabled' });
  } finally {
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('[data-contrast-original]').forEach((element) => {
        const style = element.dataset.contrastOriginal!;
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
        delete element.dataset.contrastOriginal;
      }),
    );
  }
  return page.evaluate(
    async ({ samples, url }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const luma = (color: number[]) =>
        color.slice(0, 3).reduce((sum, n, i) => {
          const c = n / 255;
          return (
            sum +
            [0.2126, 0.7152, 0.0722][i]! * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
          );
        }, 0);
      return samples.map(({ selector, text, color, box }) => {
        const ratios = [];
        for (const x of [0.2, 0.5, 0.8])
          for (const y of [0.2, 0.5, 0.8]) {
            const bg = Array.from(
              context.getImageData(
                Math.min(canvas.width - 1, Math.max(0, Math.round(box.x + box.width * x))),
                Math.min(canvas.height - 1, Math.max(0, Math.round(box.y + box.height * y))),
                1,
                1,
              ).data,
            );
            const foreground = color
              .slice(0, 3)
              .map((n, i) => n * (color[3] ?? 1) + bg[i]! * (1 - (color[3] ?? 1)));
            const f = luma(foreground),
              b = luma(bg);
            ratios.push((Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05));
          }
        return { selector, text, ratio: Math.min(...ratios) };
      });
    },
    { samples, url: `data:image/png;base64,${buffer.toString('base64')}` },
  );
}
