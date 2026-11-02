import { useState } from 'react';
import { useDesktop } from './useDesktop';
export function DesktopSettings() {
  const desktop = useDesktop();
  const [preview, setPreview] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const [reminderDraft, setReminderDraft] = useState<string | null>(null),
    [reminderError, setReminderError] = useState<string | null>(null);
  if (!desktop.api) return null;
  const value = desktop.value?.preferences;
  return (
    <div className="desktop-settings">
      <h3>Sistema</h3>
      {!value && !desktop.error && <p>Carregando preferências…</p>}
      {value && (
        <>
          <section className="settings-system-group" aria-label="Janela">
            <h4>Janela</h4>
            <label>
              <span>Iniciar com o Windows</span>
              <input
                role="switch"
                type="checkbox"
                disabled={desktop.busy}
                checked={value.startWithWindows ?? false}
                onChange={(event) => {
                  void desktop.update({ startWithWindows: event.target.checked });
                }}
              />
            </label>
            <small>Disponível no aplicativo instalado. Não inicia uma sessão sozinho.</small>
            <label>
              <span>Manter na bandeja ao fechar</span>
              <input
                role="switch"
                type="checkbox"
                aria-disabled={desktop.busy}
                checked={value.closeToTray}
                onChange={(event) => {
                  void desktop.update({ closeToTray: event.target.checked });
                }}
              />
            </label>
            <label>
              <span>Pausar ao bloquear a tela</span>
              <input
                role="switch"
                type="checkbox"
                aria-disabled={desktop.busy}
                checked={value.pauseOnLock}
                onChange={(event) => {
                  void desktop.update({ pauseOnLock: event.target.checked });
                }}
              />
            </label>
          </section>
          <section className="settings-system-group" aria-label="Jardim de foco">
            <h4>Jardim de foco · Beta</h4>
            <label>
              <span>Mostrar jardim no Perfil</span>
              <input
                type="checkbox"
                role="switch"
                disabled={desktop.busy}
                checked={value.garden?.enabled ?? value.garden?.introductionSeen ?? false}
                onChange={(event) => {
                  void desktop.update({
                    garden: {
                      version: 1,
                      introductionSeen: value.garden?.introductionSeen ?? false,
                      enabled: event.target.checked,
                    },
                  });
                }}
              />
            </label>
            <small>
              Uma evolução visual ligada às sessões concluídas. Ocultar não apaga seu progresso.
            </small>
          </section>
          <section className="settings-system-group" aria-label="Avisos">
            <h4>Avisos</h4>
            <div className="reminder-setting">
              <label>
                <span>Lembrete diário de hábitos</span>
                <input
                  aria-label="Lembrete diário de hábitos"
                  type="text"
                  className="reminder-time"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  maxLength={5}
                  disabled={desktop.busy}
                  value={reminderDraft ?? value.habitReminder ?? ''}
                  onChange={(event) => {
                    setReminderDraft(event.target.value);
                    setReminderError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={(event) => {
                    if (reminderDraft === null) return;
                    const time = event.currentTarget.value.trim();
                    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
                      setReminderError('Use um horário entre 00:00 e 23:59.');
                      return;
                    }
                    void desktop.update({ habitReminder: time || null }).then((ok) => {
                      if (ok) setReminderDraft(null);
                    });
                  }}
                />
              </label>
              <button
                className="reminder-clear"
                disabled={desktop.busy || !value.habitReminder}
                onClick={() => {
                  setReminderDraft(null);
                  setReminderError(null);
                  void desktop.update({ habitReminder: null });
                }}
              >
                Desativar lembrete
              </button>
            </div>
            {reminderError && <p role="alert">{reminderError}</p>}
            <small>
              Somente enquanto o Krono estiver aberto, se houver hábitos pendentes e notificações
              ativadas. Sem recuperar avisos atrasados.
            </small>
            <label>
              <span>Notificação ao concluir</span>
              <input
                role="switch"
                type="checkbox"
                aria-disabled={desktop.busy}
                checked={value.notificationsEnabled}
                onChange={(event) => {
                  void desktop.update({ notificationsEnabled: event.target.checked });
                }}
              />
            </label>
          </section>
          <section
            className="settings-system-group desktop-audio"
            role="group"
            aria-label="Áudio do aplicativo"
          >
            <h4>Áudio</h4>
            <label>
              <span>Som ao concluir</span>
              <input
                role="switch"
                type="checkbox"
                aria-disabled={desktop.busy}
                checked={value.soundEnabled}
                onChange={(event) => {
                  void desktop.update({ soundEnabled: event.target.checked });
                }}
              />
            </label>
            <div className="desktop-volume-row">
              <span id="desktop-volume-label">Volume do aplicativo</span>
              <div className="desktop-volume-controls">
                <input
                  aria-labelledby="desktop-volume-label"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  disabled={!value.soundEnabled}
                  aria-disabled={desktop.busy}
                  value={volumeDraft ?? value.volume}
                  onChange={(event) => setVolumeDraft(Number(event.target.value))}
                  onPointerUp={(event) => {
                    void desktop.update({ volume: Number(event.currentTarget.value) });
                    setVolumeDraft(null);
                  }}
                  onKeyUp={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      void desktop.update({ volume: Number(event.currentTarget.value) });
                      setVolumeDraft(null);
                    }
                  }}
                  onBlur={(event) => {
                    if (volumeDraft !== null) {
                      void desktop.update({ volume: Number(event.currentTarget.value) });
                      setVolumeDraft(null);
                    }
                  }}
                />
                <output aria-hidden="true">
                  {Math.round((volumeDraft ?? value.volume) * 100)}%
                </output>
                <button
                  className="desktop-preview"
                  disabled={!value.soundEnabled || value.volume === 0}
                  aria-disabled={playing || desktop.busy}
                  onClick={() => {
                    if (playing || desktop.busy) return;
                    setPlaying(true);
                    void desktop
                      .api!.preview()
                      .then((result) =>
                        setPreview(
                          result === 'finished'
                            ? 'Prévia concluída. O volume do Windows não foi alterado.'
                            : result === 'disabled'
                              ? 'Som desativado.'
                              : 'Não foi possível reproduzir a prévia.',
                        ),
                      )
                      .catch(() => setPreview('Não foi possível reproduzir a prévia.'))
                      .finally(() => setPlaying(false));
                  }}
                >
                  Testar som
                </button>
              </div>
            </div>
            <p className="desktop-preview-status" role="status">
              {preview}
            </p>
          </section>
        </>
      )}
      {desktop.busy && <p role="status">Salvando preferência…</p>}
      {(desktop.error || desktop.value?.error) && (
        <p role="alert">{desktop.error ?? desktop.value?.error}</p>
      )}
    </div>
  );
}
