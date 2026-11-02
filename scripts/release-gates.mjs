import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const commands = [
  'lint',
  'typecheck',
  'test:unit',
  'build',
  'test:integration',
  'test:e2e',
  'test:motion',
  'test:study',
  'test:performance',
  'test:installer-policy',
  'test:setup',
  'test:build-proxy',
  'dist',
  'test:packaged',
];
const directory = `artifacts/reports/release/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(directory, { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Execute por npm run test:release');
let failed = false;
const results = [];
for (const command of commands) {
  const run = spawnSync(process.execPath, [npmCli, 'run', command], { encoding: 'utf8' });
  writeFileSync(
    `${directory}/${command.replaceAll(':', '-')}.log`,
    `${run.stdout ?? ''}\n${run.stderr ?? ''}\n${run.error ?? ''}`,
  );
  results.push({ command, exitCode: run.status, result: run.status === 0 ? 'passed' : 'failed' });
  console.log(`${command}: ${run.status === 0 ? 'aprovado' : 'falhou'}`);
  if (run.status !== 0) failed = true;
}
const blockers = [
  'VM Windows com shell real: instalação, toast/click, áudio, bandeja, energia, startup, atualização/reinstalação/downgrade',
  'DPI nativo e leitor de tela; diálogos/relaunch de restauração e resgate instalado; energia e recursos na aplicação instalada',
];
writeFileSync(
  `${directory}/installed-gates.json`,
  JSON.stringify({ status: 'not-executed', blockers }, null, 2),
);
writeFileSync(
  `${directory}/summary.json`,
  JSON.stringify({ version, results, release: 'blocked', blockers }, null, 2),
);
writeFileSync('artifacts/reports/release/latest.json', JSON.stringify({ directory }, null, 2));
console.error(
  'Candidato NÃO liberado: gates de instalação e produto pendentes. Veja artifacts/reports/release.',
);
process.exitCode = failed ? 1 : 2;
