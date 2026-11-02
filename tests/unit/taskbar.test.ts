import { it, expect } from 'vitest';
import { taskbarDetails } from '../../electron/lifecycle/taskbar';
it('barra usa recurso PE do EXE instalado, sem caminhos internos ASAR para o Shell', () => {
  const details = taskbarDetails('C:\\Krono\\resources\\app.asar', 'C:\\Krono\\Krono.exe', true);
  expect(details.appId).toBe('com.krono.desktop');
  expect(details.appIconPath).toBe('C:\\Krono\\Krono.exe');
  expect(details.appIconIndex).toBe(0);
  expect(details.relaunchCommand).toBe('"C:\\Krono\\Krono.exe"');
  expect(details.relaunchDisplayName).toBe('Krono');
});
it('desenvolvimento usa ICO local e reabre o projeto, preservando espaços e aspas', () => {
  const details = taskbarDetails('C:\\Meus projetos\\Krono', 'C:\\Node\\electron.exe', false);
  expect(details.appId).toBe('com.krono.desktop.dev');
  expect(details.appIconPath).toMatch(/principal\.ico$/);
  expect(details.relaunchCommand).toBe('"C:\\Node\\electron.exe" "C:\\Meus projetos\\Krono"');
  expect(taskbarDetails('C:\\Krono\\', 'C:\\Path\\a"b.exe', false).relaunchCommand).toBe(
    '"C:\\Path\\a\\"b.exe" "C:\\Krono\\\\"',
  );
});
