import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Não modifica node_modules. Copia somente os templates usados, mantendo a origem.
const root = resolve('.test-data/generated/nsis');
await mkdir(root, { recursive: true });
const template = 'node_modules/app-builder-lib/templates/nsis';
const replaceOnce = (source, from, to) => {
  assert.equal(source.split(from).length, 2, `Upstream NSIS changed: ${from.slice(0, 70)}`);
  return source.replace(from, to);
};
const include = (name) => `"${joinWindows(root, name)}"`;
function joinWindows(directory, name) {
  return `${directory}\\${name}`;
}
const files = [
  'installer.nsi',
  'installSection.nsh',
  'include/installer.nsh',
  'include/extractAppPackage.nsh',
  'include/installUtil.nsh',
  'uninstaller.nsh',
];
for (const file of files) {
  let source = (await readFile(`${template}/${file}`, 'utf8')).replaceAll('\r\n', '\n');
  const name = file.split('/').at(-1);
  if (file === 'installer.nsi') {
    for (const child of ['installUtil.nsh', 'installSection.nsh', 'uninstaller.nsh'])
      source = replaceOnce(source, `!include "${child}"`, `!include ${include(child)}`);
  }
  if (file === 'installSection.nsh') {
    source = replaceOnce(
      source,
      '!include installer.nsh',
      `!include ${include('engine-installer.nsh')}`,
    );
    // O pai também deve liberar o diretório: o uninstaller antigo remove sua raiz.
    // Mantém o erro real de remoção, em vez de aceitar uma pasta ocupada como sucesso.
    source = replaceOnce(
      source,
      '!insertmacro uninstallOldVersion SHELL_CONTEXT',
      'SetOutPath $TEMP\n!insertmacro uninstallOldVersion SHELL_CONTEXT',
    );
  }
  if (file === 'include/installer.nsh')
    source = replaceOnce(
      source,
      '!include "extractAppPackage.nsh"',
      `!include ${include('extractAppPackage.nsh')}`,
    );
  if (file === 'uninstaller.nsh') {
    source = replaceOnce(
      source,
      '    RMDir /r $INSTDIR',
      '    ClearErrors\n    RMDir /r $INSTDIR\n    ${If} ${Errors}\n      SetErrorLevel 1603\n      Quit\n    ${EndIf}',
    );
  }
  if (file === 'include/extractAppPackage.nsh') {
    const start = source.indexOf('    # As an absolutely last resort');
    const end = source.indexOf('  RetryExtract7za:', start);
    assert.ok(start > 0 && end > start, 'Upstream extraction fallback changed');
    source =
      source.slice(0, start) +
      '    Goto RetryExtract7za\n\n  AbortExtract7za:\n    SetErrorLevel 1603\n    Quit\n\n' +
      source.slice(end);
    source = replaceOnce(
      source,
      '${else}\n      MessageBox MB_RETRYCANCEL',
      '${else}\n      ${If} ${Silent}\n        SetErrorLevel 1603\n        Quit\n      ${EndIf}\n      MessageBox MB_RETRYCANCEL',
    );
    source = replaceOnce(source, 'StrCmp $R0 "success" +3', 'StrCmp $R0 "success" +4');
    source = replaceOnce(
      source,
      'MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)$\\n$R0"\n      Quit',
      'MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)$\\n$R0"\n      SetErrorLevel 1603\n      Quit',
    );
    assert.ok(!source.includes('ignore errors') && !source.includes('just overwrite everything'));
  }
  // Em /S, diálogos do script precisam de resposta explícita e conservadora.
  source = source
    .split('\n')
    .map((line) => {
      if (!/^\s*MessageBox\s/i.test(line)) return line;
      if (line.includes('/SD ')) return line.replace('/SD IDRETRY', '/SD IDCANCEL');
      const message = line.match(/^(\s*MessageBox\s+\S+\s+"(?:[^"\n]|\$\\")*")(.*)$/i);
      assert.ok(message, `Unrecognized upstream MessageBox: ${line}`);
      const fallback = /MB_(?:RETRY|OK)CANCEL/.test(line)
        ? 'IDCANCEL'
        : /MB_YESNO/.test(line)
          ? 'IDNO'
          : /MB_ABORTRETRYIGNORE/.test(line)
            ? 'IDABORT'
            : 'IDOK';
      return `${message[1]} /SD ${fallback}${message[2]}`;
    })
    .join('\n');
  assert.ok(
    !source.split('\n').some((line) => /^\s*MessageBox\s/i.test(line) && !line.includes('/SD ')),
  );
  await writeFile(`${root}/${name === 'installer.nsh' ? 'engine-installer.nsh' : name}`, source);
}
console.log(
  'Engine NSIS gerado: defaults silenciosos, erro 1603 e sem fallback que ignora falhas.',
);
