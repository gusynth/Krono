// Licenças dos módulos compilados, preservadas mesmo sem suas fontes no pacote.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('public/licenses/dependencies', { recursive: true });
for (const [name, file] of Object.entries({
  react: 'LICENSE',
  'react-dom': 'LICENSE',
  scheduler: 'LICENSE',
  'lucide-react': 'LICENSE',
  motion: 'LICENSE.md',
  'framer-motion': 'LICENSE.md',
  'motion-dom': 'LICENSE.md',
  'motion-utils': 'LICENSE.md',
  tslib: 'LICENSE.txt',
  zod: 'LICENSE',
  'node-addon-api': 'LICENSE.md',
  'better-sqlite3': 'LICENSE',
})) {
  await writeFile(
    `public/licenses/dependencies/${name}.txt`,
    await readFile(`node_modules/${name}/${file}`),
  );
}
