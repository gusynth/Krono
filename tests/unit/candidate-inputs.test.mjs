import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { candidateInputChanges } from '../../scripts/candidate-inputs.mjs';

it('candidato detecta entradas raiz, assets, código, ferramentas e ambiente ignorado sem ler conteúdo', () => {
  mkdirSync('.test-data', { recursive: true });
  const root = mkdtempSync(resolve('.test-data/candidate-inputs-regression-'));
  const git = (args) => {
    const run = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    expect(run.status, run.stderr).toBe(0);
    return run.stdout;
  };
  const inputs = [
    'assets/desktop/brand/source.png',
    'index.html',
    'public/icon.svg',
    'src/app.ts',
    'electron/main.ts',
    'shared/version.ts',
    'assets/test.svg',
    'build/installer.nsh',
    'scripts/build-electron.mjs',
    'scripts/candidate-inputs.mjs',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    '.npmrc',
  ];
  const put = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  git(['init']);
  for (const path of [...inputs, 'docs/test.md', '01-PLANO-KRONO.md'])
    put(path, 'synthetic original');
  put('.gitignore', '.env*\n');
  git(['add', '.']);
  git([
    '-c',
    'user.name=Krono fixture',
    '-c',
    'user.email=fixture@krono.invalid',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=NUL',
    'commit',
    '-m',
    'synthetic baseline',
  ]);
  expect(candidateInputChanges(root)).toBe('');
  for (const path of inputs) {
    put(path, 'synthetic change');
    expect(candidateInputChanges(root), path).toContain(path);
    put(path, 'synthetic original');
    expect(candidateInputChanges(root), path).toBe('');
  }
  put('public/new.svg', 'synthetic addition');
  expect(candidateInputChanges(root)).toContain('?? public/new.svg');
  unlinkSync(join(root, 'public/new.svg'));
  put('.env.local', 'SYNTHETIC_ONLY=1');
  expect(candidateInputChanges(root)).toContain('!! .env.local');
  unlinkSync(join(root, '.env.local'));
  unlinkSync(join(root, 'index.html'));
  expect(candidateInputChanges(root)).toContain('D index.html');
  put('index.html', 'synthetic original');
  put('docs/test.md', 'documentation change');
  unlinkSync(join(root, '01-PLANO-KRONO.md'));
  expect(candidateInputChanges(root)).toBe('');
  // Esta fixture abre mais de 35 processos Git no Windows; o limite é operacional, não uma meta do produto.
}, 15_000);

it('candidato recusa confirmar origem se Git não pode examinar o diretório', () => {
  expect(() =>
    candidateInputChanges(resolve('.test-data/nonexistent-candidate-root', 'missing')),
  ).toThrow('CANDIDATE_SOURCE_STATUS_UNAVAILABLE');
});
