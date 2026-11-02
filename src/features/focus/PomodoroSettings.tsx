import { useDesktop } from '../settings/useDesktop';
import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { StudyPopover } from '../../study/StudyPopover';
import { timerConfigurationSchema, type TimerConfiguration } from '../../../shared/contracts/timer';
import { configuredPreset, timerDurationLabel } from '../../../shared/domain/pomodoro';

export function PomodoroSettings({
  configuration,
  busy,
  active,
  save,
}: {
  configuration: TimerConfiguration;
  busy: boolean;
  active: boolean;
  save: (value: TimerConfiguration) => Promise<boolean>;
}) {
  const desktop = useDesktop();
  const [presetName, setPresetName] = useState('');
  const [draft, setDraft] = useState(configuration),
    [error, setError] = useState<string | null>(null);
  const parsed = timerConfigurationSchema.safeParse(draft),
    preset = parsed.success ? configuredPreset(parsed.data) : null;
  return (
    <StudyPopover
      className="preset-popover"
      label="Configuração do preset"
      onOpen={() => {
        setDraft(configuration);
        setError(null);
      }}
      trigger={
        <>
          <span>
            Pomodoro <span className="preset-duration">{configuration.focusMinutes} min</span>
          </span>
          <ChevronDown size={13} aria-hidden="true" />
        </>
      }
    >
      <form
        className="pomodoro-form"
        aria-label="Configurar Pomodoro"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          if (!parsed.success) {
            setError('Confira os limites dos campos.');
            return;
          }
          void save(parsed.data).then((ok) => {
            if (ok) {
              const popover = form.closest<HTMLElement>('[popover]');
              popover?.hidePopover();
              (
                document.querySelector('.preset-popover > button') as HTMLButtonElement | null
              )?.focus();
            } else
              setError('Não foi possível confirmar a configuração. Confira o aviso da sessão.');
          });
        }}
      >
        <div className="popover-title">
          <h2>Pomodoro</h2>
          <button
            type="button"
            className="popover-close"
            aria-label="Fechar configuração"
            onClick={(event) => {
              event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
              (
                document.querySelector('.preset-popover > button') as HTMLButtonElement | null
              )?.focus();
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div className="pomodoro-body">
          <section className="pomodoro-section pomodoro-focus" aria-label="Tempo de foco">
            <label className="duration-field">
              <span>Duração do foco</span>
              <span>
                <input
                  type="number"
                  name="focus"
                  aria-label="Duração do foco em minutos"
                  aria-description="De 1 a 240 minutos"
                  min={1}
                  max={240}
                  step={1}
                  required
                  disabled={busy}
                  value={draft.focusMinutes || ''}
                  onChange={(event) =>
                    setDraft({ ...draft, focusMinutes: Number(event.target.value) })
                  }
                />
                <span>min</span>
              </span>
            </label>
          </section>
          <section className="pomodoro-section pomodoro-pauses" aria-label="Pausas">
            <div className="pomodoro-section-heading">
              <h3>Pausas</h3>
              <label className="proportional-setting">
                <span>Proporcionais</span>
                <input
                  aria-label="Pausas proporcionais"
                  type="checkbox"
                  role="switch"
                  checked={draft.proportional}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      proportional: event.target.checked,
                      shortBreakMinutes:
                        draft.shortBreakMinutes >= 1 && draft.shortBreakMinutes <= 120
                          ? draft.shortBreakMinutes
                          : configuration.shortBreakMinutes,
                      longBreakMinutes:
                        draft.longBreakMinutes >= 1 && draft.longBreakMinutes <= 120
                          ? draft.longBreakMinutes
                          : configuration.longBreakMinutes,
                    })
                  }
                />
              </label>
            </div>
            {draft.proportional ? (
              <dl className="pause-preview">
                <div>
                  <dt>Pausa curta</dt>
                  <dd>{preset ? timerDurationLabel(preset.shortBreakMs) : '—'}</dd>
                </div>
                <div>
                  <dt>Pausa longa</dt>
                  <dd>{preset ? timerDurationLabel(preset.longBreakMs) : '—'}</dd>
                </div>
              </dl>
            ) : (
              <div className="manual-pauses">
                {(['shortBreakMinutes', 'longBreakMinutes'] as const).map((key, index) => (
                  <label key={key}>
                    {index ? 'Pausa longa (min)' : 'Pausa curta (min)'}
                    <input
                      type="number"
                      min={1}
                      max={120}
                      step={1}
                      required
                      disabled={busy}
                      value={draft[key] || ''}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <p className="pause-start-note">Você inicia as pausas manualmente.</p>
            {draft.proportional && (
              <details className="configuration-help">
                <summary>Como as pausas são calculadas</summary>
                <p className="configuration-note">
                  Proporção baseada em 25:5:15. Você pode ajustar as pausas manualmente; não há
                  intervalo ideal universal.
                </p>
              </details>
            )}
          </section>
          <section className="pomodoro-section pomodoro-cycle" aria-label="Ciclo">
            <label className="duration-field">
              <span>Pausa longa a cada</span>
              <span>
                <input
                  type="number"
                  aria-label="Focos antes da pausa longa"
                  min={1}
                  max={12}
                  step={1}
                  required
                  disabled={busy}
                  value={draft.longEvery || ''}
                  onChange={(event) =>
                    setDraft({ ...draft, longEvery: Number(event.target.value) })
                  }
                />
                <span>focos</span>
              </span>
            </label>
            {draft.longEvery !== configuration.longEvery && (
              <p className="configuration-note">
                A nova quantidade inicia outro conjunto no próximo foco.
              </p>
            )}
          </section>
          {desktop.value && (
            <details className="saved-presets">
              <summary>
                <ChevronDown size={13} aria-hidden="true" />
                <span>Meus presets</span>
                {!!desktop.value.preferences.presets?.length && (
                  <small aria-hidden="true">{desktop.value.preferences.presets.length}/6</small>
                )}
              </summary>
              <div className="saved-preset-body">
                <div className="preset-list">
                  {(desktop.value.preferences.presets ?? []).map((item, index) => (
                    <span key={index}>
                      <button
                        type="button"
                        className="preset-choice"
                        title={item.name}
                        aria-label={item.name}
                        disabled={busy}
                        onClick={() => setDraft(item.configuration)}
                      >
                        <span>{item.name}</span>
                        <small>{item.configuration.focusMinutes} min</small>
                      </button>
                      <button
                        type="button"
                        className="preset-delete"
                        aria-label={`Excluir preset ${item.name}`}
                        disabled={desktop.busy}
                        onClick={() => {
                          void desktop.update({
                            presets: desktop.value!.preferences.presets!.filter(
                              (_, i) => i !== index,
                            ),
                          });
                        }}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
                {!desktop.value.preferences.presets?.length && (
                  <p className="preset-empty">Nenhum preset guardado.</p>
                )}
                <div className="preset-create">
                  <label>
                    <span>Nome do preset</span>
                    <input
                      maxLength={30}
                      placeholder="Ex.: Leitura"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Guardar preset"
                    disabled={
                      desktop.busy ||
                      !parsed.success ||
                      !presetName.trim() ||
                      (desktop.value.preferences.presets?.length ?? 0) >= 6
                    }
                    onClick={() => {
                      void desktop
                        .update({
                          presets: [
                            ...(desktop.value!.preferences.presets ?? []),
                            { name: presetName.trim(), configuration: draft },
                          ],
                        })
                        .then((ok) => {
                          if (ok) setPresetName('');
                        });
                    }}
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span>Guardar</span>
                  </button>
                </div>
                <small className="preset-hint">
                  Até seis presets. Escolher preenche os campos; Salvar configuração aplica.
                </small>
                {desktop.error && <p role="alert">{desktop.error}</p>}
              </div>
            </details>
          )}
          {active && (
            <p className="configuration-note">
              Alterações valem para o próximo foco. A sessão e sua pausa mantêm os tempos atuais.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="pomodoro-footer">
          <button type="submit" className="settings-save" disabled={busy || !parsed.success}>
            {busy ? 'Salvando…' : 'Salvar configuração'}
          </button>
        </div>
      </form>
    </StudyPopover>
  );
}
