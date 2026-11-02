import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync('src/design/tokens.css', 'utf8');
function token(name: string) {
  const match = css.match(new RegExp(`--color-${name}: (#[a-f0-9]{6})`, 'i'));
  if (!match) throw new Error(`Token ausente: ${name}`);
  return match[1];
}
function luminance(hex: string) {
  return [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
it('texto normal atende 4,5:1 nos fundos de leitura e tinta escura sobre accents', () => {
  for (const foreground of ['text', 'secondary', 'meta'])
    for (const background of [token('bg'), token('surface'), '#242429'])
      expect(
        contrast(token(foreground), background),
        `${foreground}/${background}`,
      ).toBeGreaterThanOrEqual(4.5);
  for (const accent of ['focus', 'rest'])
    expect(contrast(token('ink'), token(accent))).toBeGreaterThanOrEqual(4.5);
});
