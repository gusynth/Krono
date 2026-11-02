import { spawnSync } from 'node:child_process';

// Inclui entradas raiz do Vite e arquivos ignorados de ambiente. Não lê seu conteúdo.
const paths = [
  'src',
  'electron',
  'shared',
  'assets',
  'public',
  'build',
  'scripts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'assets/desktop/brand/source.png',
  '.npmrc',
  '.env',
  '.env.*',
];

export function candidateInputChanges(root = process.cwd()) {
  const run = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--ignored=matching', '--', ...paths],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  if (run.status !== 0) throw new Error('CANDIDATE_SOURCE_STATUS_UNAVAILABLE');
  return run.stdout.trim();
}
