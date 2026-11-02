import editorialMark from '../../../assets/desktop/brand/cronus-256.png';
import { useSettingsMotion } from './useSettingsMotion';
import { useSystemReducedMotion } from '../../design/useSystemReducedMotion';
import { usePageVisibility } from '../../study/usePageVisibility';
import { MaintenanceSettings } from './MaintenanceSettings';
import { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { AppDialog } from '../../design/AppDialog';
import { CompactSelect } from '../../design/CompactSelect';
import { themes } from '../../design/themes';
import type { AppearancePreferences } from '../../design/useAppearancePreferences';
import { DesktopSettings } from './DesktopSettings';
import { BackupSettings } from './BackupSettings';
import { GlobalShortcutSettings } from './GlobalShortcutSettings';
import { appVersion, buildNumber } from '../../../shared/version';
import type { StorageStatus } from '../../app/useFoundationStatus';

export function SettingsPanel({
  appearance,
  timerUnavailable,
  storageStatus,
  onIntroduction,
}: {
  appearance: AppearancePreferences;
  timerUnavailable: boolean;
  storageStatus: StorageStatus;
  onIntroduction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState('appearance-settings');
  const systemReduced = useSystemReducedMotion();
  const visible = usePageVisibility();
  const surface = useSettingsMotion(
    open,
    section,
    appearance.reducedMotion || systemReduced || !visible,
  );
  useEffect(() => {
    if (open && section !== 'appearance-settings')
      document.getElementById(section)?.querySelector<HTMLElement>('button,input')?.focus();
  }, [section, open]);
  return (
    <div className="settings-popover">
      <button
        className="study-popover-trigger"
        aria-label="Ajustes"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Settings size={20} strokeWidth={1.6} />
      </button>
      {open && (
        <AppDialog
          title="Ajustes"
          className="study-popover settings-dialog"
          onCancel={() => setOpen(false)}
        >
          <div role="region" aria-label="Ajustes" className="settings-content" ref={surface}>
            <button
              autoFocus
              className="settings-close"
              aria-label="Fechar ajustes"
              onClick={() => setOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <div className="settings-sections" role="group" aria-label="Seções dos ajustes">
              {[
                { id: 'appearance-settings', name: 'Aparência' },
                { id: 'system-settings', name: 'Sistema' },
                { id: 'data-settings', name: 'Dados' },
                { id: 'shortcut-settings', name: 'Atalhos' },
                { id: 'about-settings', name: 'Sobre' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-controls={item.id}
                  aria-pressed={item.id === section}
                  onClick={() => setSection(item.id)}
                >
                  {item.name}
                </button>
              ))}
              <i className="settings-selection" aria-hidden="true" />
            </div>
            <div className="settings-pages">
              <section
                hidden={section !== 'appearance-settings'}
                data-settings-page
                id="appearance-settings"
                className="settings-themes"
                aria-labelledby="themes-title"
              >
                <h3 id="themes-title">Aparência</h3>
                <div className="theme-options" role="group" aria-label="Tema do aplicativo">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      aria-pressed={appearance.theme === theme.id}
                      onClick={() => appearance.update({ theme: theme.id })}
                    >
                      <span className={`theme-swatch swatch-${theme.id}`} aria-hidden="true">
                        {theme.id === 'original' ? (
                          <img src={editorialMark} width="40" height="40" alt="" />
                        ) : theme.id === 'terminal' ? (
                          '>_'
                        ) : theme.id === 'classic' ? (
                          '[K]'
                        ) : (
                          'K'
                        )}
                      </span>
                      <strong>{theme.name}</strong>
                      <small>{theme.description}</small>
                    </button>
                  ))}
                </div>
                <div className="navigation-preference">
                  <span>Posição da navegação</span>
                  <CompactSelect
                    label="Posição da navegação"
                    value={appearance.navigation}
                    onChange={(navigation) =>
                      appearance.update({ navigation: navigation as 'side' | 'top' })
                    }
                    options={[
                      { value: 'side', label: 'Lateral recolhível' },
                      { value: 'top', label: 'Superior' },
                    ]}
                  />
                </div>
                <div className="settings-toggles">
                  {(
                    [
                      { key: 'rememberPage', name: 'Reabrir na última tela' },
                      { key: 'ambient', name: 'Fundo ambiente' },
                      { key: 'reducedMotion', name: 'Reduzir animações' },
                      { key: 'reducedEffects', name: 'Reduzir transparência/efeitos' },
                    ] as const
                  ).map((item) => (
                    <label key={item.key}>
                      <span>{item.name}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={appearance[item.key]}
                        onChange={(event) =>
                          appearance.update({ [item.key]: event.target.checked })
                        }
                      />
                    </label>
                  ))}
                </div>
                {appearance.theme === 'original' && (
                  <p className="appearance-ambient-note">
                    O fundo ambiente varia suavemente a iluminação. Desligado, mantém a luz estática
                    e a transição ao navegar. Efeitos reduzidos desativam a iluminação.
                  </p>
                )}
              </section>
              <div className="settings-columns">
                <div data-settings-page id="system-settings" hidden={section !== 'system-settings'}>
                  <DesktopSettings />
                </div>
                <div className="settings-secondary">
                  <div data-settings-page id="data-settings" hidden={section !== 'data-settings'}>
                    <BackupSettings />
                    <MaintenanceSettings />
                  </div>
                  <section
                    hidden={section !== 'shortcut-settings'}
                    data-settings-page
                    id="shortcut-settings"
                    className="shortcut-settings"
                  >
                    <h3>Atalhos nesta janela</h3>
                    <div className="shortcut-field">
                      <span>Iniciar, pausar ou retomar em Foco</span>
                      <CompactSelect
                        label="Atalho do temporizador"
                        value={appearance.shortcut}
                        onChange={(shortcut) =>
                          appearance.update({
                            shortcut: shortcut as AppearancePreferences['shortcut'],
                          })
                        }
                        options={[
                          { value: 'ctrl-space', label: 'Ctrl + Espaço' },
                          { value: 'ctrl-shift-space', label: 'Ctrl + Shift + Espaço' },
                          { value: 'off', label: 'Desativado' },
                        ]}
                      />
                    </div>
                    <p>
                      Alt + 1–4: navegar · Ctrl + vírgula: Ajustes · Ctrl + Shift + M: mini timer.
                    </p>
                    <small>
                      Os atalhos não atuam em campos de texto nem enquanto um diálogo ou menu está
                      aberto.
                    </small>
                    <GlobalShortcutSettings />
                  </section>
                </div>
              </div>
              <section
                hidden={section !== 'about-settings'}
                data-settings-page
                id="about-settings"
                className="settings-about"
              >
                <h3>Sobre e diagnóstico</h3>
                <p className="settings-diagnostic">
                  Krono {appVersion} ·{' '}
                  {timerUnavailable
                    ? 'Temporizador indisponível · verifique o aviso'
                    : storageStatus === 'ready'
                      ? 'Base local disponível'
                      : storageStatus === 'error'
                        ? 'Base local indisponível'
                        : storageStatus === 'checking'
                          ? 'Verificando base local…'
                          : 'Prévia demonstrativa · sem registros locais'}
                </p>
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `Krono ${appVersion}\nIdentificador técnico: ${buildNumber}\nBase: ${storageStatus}\nTema: ${appearance.theme}\nNavegação: ${appearance.navigation}\nRedução: ${appearance.reducedMotion}/${appearance.reducedEffects}`,
                      )
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false));
                  }}
                >
                  Copiar diagnóstico
                </button>
                {copied && <p role="status">Diagnóstico copiado, sem registros pessoais.</p>}
                <button
                  className="introduction-replay"
                  onClick={() => {
                    setOpen(false);
                    onIntroduction();
                  }}
                >
                  Rever apresentação
                </button>
                {appearance.nativeError && <p role="status">{appearance.nativeError}</p>}
              </section>
            </div>
          </div>
        </AppDialog>
      )}
    </div>
  );
}
