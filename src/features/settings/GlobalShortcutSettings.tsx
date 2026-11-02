import { useEffect, useRef, useState } from 'react';
import {
  shortcutSnapshotSchema,
  type GlobalShortcutChoice,
  type ShortcutSnapshot,
} from '../../../shared/contracts/welcome';
import { CompactSelect } from '../../design/CompactSelect';
export function GlobalShortcutSettings() {
  const api = window.krono?.shortcut;
  const [value, setValue] = useState<ShortcutSnapshot | null>(null),
    [draft, setDraft] = useState<GlobalShortcutChoice>('off');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const accept = (input: unknown) => {
      const next = shortcutSnapshotSchema.parse(input);
      if (alive) {
        setValue(next);
        setDraft(next.configured);
      }
    };
    const off = api.subscribe((input) => {
      try {
        accept(input);
      } catch {
        if (alive) setError('Resposta inválida do atalho.');
      }
    });
    void api
      .read()
      .then(accept)
      .catch(() => {
        if (alive) setError('Atalho indisponível.');
      });
    return () => {
      alive = false;
      off();
    };
  }, [api]);
  if (!api) return <p>O atalho global está disponível no aplicativo desktop.</p>;
  async function apply() {
    if (!api || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      setValue(shortcutSnapshotSchema.parse(await api.set(draft)));
    } catch {
      setError('Não foi possível configurar o atalho.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="global-shortcut">
      <h3>Abrir o Krono de qualquer aplicativo</h3>
      <p>
        Opcional. Funciona enquanto o Krono estiver aberto, inclusive na bandeja. Não inicia uma
        sessão.
      </p>
      <div className="global-shortcut-controls">
        <CompactSelect
          label="Atalho global"
          value={draft}
          disabled={busy}
          onChange={(next) => setDraft(next as GlobalShortcutChoice)}
          options={[
            { value: 'off', label: 'Desativado' },
            { value: 'Control+Alt+K', label: 'Ctrl + Alt + K' },
            { value: 'Control+Shift+K', label: 'Ctrl + Shift + K' },
            { value: 'Control+Alt+Space', label: 'Ctrl + Alt + Espaço' },
          ]}
        />
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => {
            void apply();
          }}
        >
          {busy ? 'Aplicando…' : 'Aplicar atalho'}
        </button>
      </div>
      {error || value?.message ? (
        <p role="alert">{error ?? value?.message}</p>
      ) : (
        <p role="status">
          {value?.active && value.active !== 'off'
            ? `Ativo: ${value.active.replace('Control', 'Ctrl').replace('Space', 'Espaço').replaceAll('+', ' + ')}`
            : 'Atalho global desativado.'}
        </p>
      )}
    </section>
  );
}
