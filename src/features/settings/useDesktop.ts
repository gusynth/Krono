import { useEffect, useRef, useState } from 'react';
import {
  desktopSnapshotSchema,
  type DesktopSnapshot,
  type PreferenceUpdate,
} from '../../../shared/contracts/desktop';
export function useDesktop() {
  const api = window.krono?.desktop;
  const [value, setValue] = useState<DesktopSnapshot | null>(null);
  const latest = useRef<DesktopSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PreferenceUpdate['patch'] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    let active = true;
    const accept = (input: unknown) => {
      const next = desktopSnapshotSchema.parse(input);
      if (active && (!latest.current || next.revision >= latest.current.revision)) {
        latest.current = next;
        setValue(next);
      }
    };
    const unsubscribe = api.subscribe((input) => {
      try {
        accept(input);
      } catch {
        if (active) setError('Não foi possível consultar os avisos do aplicativo.');
      }
    });
    void api
      .read()
      .then(accept)
      .catch(() => {
        if (active) setError('Preferências e avisos indisponíveis. Feche e reabra o aplicativo.');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);
  async function update(patch: PreferenceUpdate['patch']) {
    if (!api || !latest.current || busy) return false;
    setBusy(true);
    setDraft(patch);
    setError(null);
    try {
      const next = desktopSnapshotSchema.parse(
        await api.update({ expectedRevision: latest.current.preferences.revision, patch }),
      );
      if (!latest.current || next.revision >= latest.current.revision) {
        latest.current = next;
        setValue(next);
      }
      return !next.error;
    } catch {
      setError('Não foi possível salvar a preferência.');
      return false;
    } finally {
      setDraft(null);
      setBusy(false);
    }
  }
  async function dismiss(id: string) {
    if (!api) return;
    try {
      const next = desktopSnapshotSchema.parse(await api.dismiss(id));
      if (!latest.current || next.revision >= latest.current.revision) {
        latest.current = next;
        setValue(next);
      }
    } catch {
      setError('Não foi possível dispensar o aviso.');
    }
  }
  return {
    api,
    value: value && draft ? { ...value, preferences: { ...value.preferences, ...draft } } : value,
    error,
    busy,
    update,
    dismiss,
  };
}
