import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';

it('ICOs têm os nove tamanhos PNG com alpha e frames inteiros, incluindo 256 px', () => {
  for (const kind of ['principal', 'tray-light', 'tray-dark']) {
    const ico = readFileSync(`assets/desktop/brand/${kind}.ico`);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(9);
    let offset = 6 + 9 * 16;
    [16, 20, 24, 32, 40, 48, 64, 128, 256].forEach((size, index) => {
      const at = 6 + index * 16,
        length = ico.readUInt32LE(at + 8);
      expect(ico[at] || 256).toBe(size);
      expect(ico[at + 1] || 256).toBe(size);
      expect(ico.readUInt32LE(at + 12)).toBe(offset);
      const png = ico.subarray(offset, offset + length);
      expect(png.equals(readFileSync(`assets/desktop/brand/${kind}-${size}.png`))).toBe(true);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(png[25]).toBe(6);
      offset += length;
    });
    expect(offset).toBe(ico.length);
  }
});

it('executável/instalador/desinstalador usam a marca fornecida sem assinatura fictícia ou mudança de identidade', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg.build.appId).toBe('com.krono.desktop');
  expect(pkg.build.win.icon).toBe('assets/desktop/brand/principal.ico');
  expect(pkg.build.nsis.installerIcon).toBe(pkg.build.win.icon);
  expect(pkg.build.nsis.uninstallerIcon).toBe(pkg.build.win.icon);
  expect(pkg.build.win.signExecutable).toBe(false);
});
