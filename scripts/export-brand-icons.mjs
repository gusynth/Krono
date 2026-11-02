// Exportação técnica local; não altera os arquivos originais fornecidos.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _electron } from '@playwright/test';

const root = process.cwd(),
  work = resolve('.test-data/brand-export');
await mkdir(work, { recursive: true });
await mkdir('assets/desktop/brand', { recursive: true });
await mkdir('docs/evidence/editorial-icons', { recursive: true });
await writeFile(
  resolve(work, 'main.cjs'),
  `const {app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();globalThis.brandFs=require('node:fs/promises');globalThis.brandPath=require('node:path');app.setPath('userData',${JSON.stringify(resolve(work, 'profile'))});app.whenReady().then(()=>{new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});});`,
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
  ),
);
const app = await _electron.launch({
  args: ['--force-device-scale-factor=1', resolve(work, 'main.cjs')],
  env,
});
try {
  const encoded = (await readFile('assets/desktop/brand/source.png')).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><mask id="portrait"><image href="data:image/png;base64,${encoded}" width="1024" height="1024"/></mask></defs><rect width="1024" height="1024" fill="#F5F5F7" mask="url(#portrait)"/></svg>`;
  const files = await app.evaluate(
    async ({ BrowserWindow }, input) => {
      const { writeFile, readFile } = globalThis.brandFs;
      const { join } = globalThis.brandPath;
      const window = new BrowserWindow({
        show: false,
        width: 1024,
        height: 1024,
        useContentSize: true,
        transparent: true,
        frame: false,
        webPreferences: {
          offscreen: true,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
      const results = [];
      function ico(frames) {
        const header = Buffer.alloc(6 + frames.length * 16);
        header.writeUInt16LE(1, 2);
        header.writeUInt16LE(frames.length, 4);
        let offset = header.length;
        frames.forEach(({ size, png }, index) => {
          const at = 6 + index * 16;
          header[at] = header[at + 1] = size === 256 ? 0 : size;
          header.writeUInt16LE(1, at + 4);
          header.writeUInt16LE(32, at + 6);
          header.writeUInt32LE(png.length, at + 8);
          header.writeUInt32LE(offset, at + 12);
          offset += png.length;
        });
        return Buffer.concat([header, ...frames.map((frame) => frame.png)]);
      }
      try {
        for (const [kind, color] of [
          ['tray-light', '#F5F5F7'],
          ['tray-dark', '#16161A'],
          ['principal', null],
        ]) {
          let source;
          if (color) {
            const svg = input.svg.replace('#F5F5F7', color);
            await window.loadURL(
              'data:text/html;charset=utf-8,' +
                encodeURIComponent(
                  `<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${svg}`,
                ),
            );
            await window.webContents.executeJavaScript(
              'Promise.all(Array.from(document.querySelectorAll("image"), async element => { const image = new Image(); image.src = element.href.baseVal; await image.decode(); })).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
            );
            source = await window.webContents.capturePage({
              x: 0,
              y: 0,
              width: 1024,
              height: 1024,
            });
          } else {
            const image = (
              await readFile(join(input.root, 'assets/desktop/brand/source.png'))
            ).toString('base64');
            await window.loadURL(
              'data:text/html;charset=utf-8,' +
                encodeURIComponent(
                  `<style>html,body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="20" y="20" width="984" height="984" rx="190" fill="#181918"/><image href="data:image/png;base64,${image}" x="100" y="100" width="824" height="824"/></svg>`,
                ),
            );
            await window.webContents.executeJavaScript(
              'Promise.all(Array.from(document.querySelectorAll("image"), async element => { const image = new Image(); image.src = element.href.baseVal; await image.decode(); })).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
            );
            source = await window.webContents.capturePage({
              x: 0,
              y: 0,
              width: 1024,
              height: 1024,
            });
          }
          if (!source.toBitmap().some((value, index) => index % 4 === 3 && value > 128))
            throw new Error('BRAND_ALPHA_EMPTY:' + kind);
          if (source.isEmpty()) throw new Error('BRAND_SOURCE_EMPTY:' + kind);
          const frames = [];
          for (const size of sizes) {
            const png = source.resize({ width: size, height: size, quality: 'best' }).toPNG();
            const name = `assets/desktop/brand/${kind}-${size}.png`;
            await writeFile(join(input.root, name), png);
            frames.push({ size, png });
            results.push(name);
          }
          const name = `assets/desktop/brand/${kind}.ico`;
          await writeFile(join(input.root, name), ico(frames));
          results.push(name);
        }
        // Comparação sem ampliar os ícones: pixels de imagem = pixels CSS, escala 1.
        const rows = [];
        for (const kind of ['principal', 'tray-light', 'tray-dark']) {
          for (const background of ['#0C0C0E', '#F5F5F7']) {
            const cells = [];
            for (const size of [16, 20, 24, 32, 48, 64, 256]) {
              const png = await readFile(
                join(input.root, `assets/desktop/brand/${kind}-${size}.png`),
              );
              cells.push(
                `<div class="cell"><img width="${size}" height="${size}" src="data:image/png;base64,${png.toString('base64')}"><span>${size}px</span></div>`,
              );
            }
            rows.push(
              `<section style="background:${background};color:${background === '#0C0C0E' ? '#F5F5F7' : '#16161A'}"><label>${kind}</label>${cells.join('')}</section>`,
            );
          }
        }
        window.setContentSize(1100, 1810);
        await window.loadURL(
          'data:text/html;charset=utf-8,' +
            encodeURIComponent(
              `<style>body{margin:0;font:13px 'Segoe UI'}section{height:300px;display:flex;align-items:center;gap:20px;padding:0 20px;box-sizing:border-box}label{width:90px}.cell{min-width:52px;display:flex;align-items:center;flex-direction:column;gap:14px}img{object-fit:contain}span{opacity:.8}</style>${rows.join('')}`,
            ),
        );
        await window.webContents.executeJavaScript(
          'Promise.all(Array.from(document.images, image => image.decode()))',
        );
        await writeFile(
          join(input.root, 'docs/evidence/editorial-icons/sizes.png'),
          (await window.webContents.capturePage()).toPNG(),
        );
        return results;
      } finally {
        window.destroy();
      }
    },
    { root, svg },
  );
  console.log(
    JSON.stringify({ files, preview: 'docs/evidence/editorial-icons/sizes.png' }, null, 2),
  );
} finally {
  await app.close();
}
