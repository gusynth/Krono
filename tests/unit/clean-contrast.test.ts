import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
const css = readFileSync('src/study/clean.css', 'utf8');
function token(name: string) {
  const match = css.match(new RegExp(`--clean-${name}:\\s*(#[a-f0-9]{6})`, 'i'));
  if (!match) throw new Error(`Token ausente: ${name}`);
  return match[1];
}
function light(hex: string) {
  return [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function ratio(a: string, b: string) {
  const values = [light(a), light(b)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
it('leitura em fundo/painel/hover e tinta sobre os accents mantém 4,5:1', () => {
  for (const text of ['text', 'secondary', 'meta'])
    for (const background of ['bg', 'surface', 'hover'])
      expect(ratio(token(text), token(background)), `${text}/${background}`).toBeGreaterThanOrEqual(
        4.5,
      );
  for (const accent of ['focus', 'rest'])
    expect(ratio(token('ink'), token(accent))).toBeGreaterThanOrEqual(4.5);
});
