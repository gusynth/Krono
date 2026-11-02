import { useEffect, useRef, useState } from 'react';
import { desktopSnapshotSchema, type DesktopSnapshot } from '../../../shared/contracts/desktop';
import {
  defaultProfile,
  profileSchema,
  type LocalProfile,
} from '../../../shared/contracts/profile';

export function useLocalProfile() {
  const api = window.krono?.desktop;
  const [value, setValue] = useState<LocalProfile | null>(api ? null : defaultProfile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const latest = useRef<DesktopSnapshot | null>(null),
    working = useRef(false),
    alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    if (!api)
      return () => {
        alive.current = false;
      };
    const accept = (input: unknown) => {
      const next = desktopSnapshotSchema.parse(input);
      if (alive.current && (!latest.current || next.revision >= latest.current.revision)) {
        latest.current = next;
        setValue(next.preferences.profile ?? defaultProfile());
      }
    };
    const off = api.subscribe((input) => {
      try {
        accept(input);
      } catch {
        if (alive.current) setError('Não foi possível ler o perfil.');
      }
    });
    void api
      .read()
      .then(accept)
      .catch(() => {
        if (alive.current) setError('Perfil indisponível. Feche e reabra o aplicativo.');
      });
    return () => {
      alive.current = false;
      off();
    };
  }, [api]);
  async function save(input: LocalProfile) {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success || working.current) return false;
    if (!api) {
      setValue(parsed.data);
      return true;
    }
    if (!latest.current) return false;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = desktopSnapshotSchema.parse(
        await api.update({
          expectedRevision: latest.current.preferences.revision,
          patch: { profile: parsed.data },
        }),
      );
      if (!alive.current) return false;
      if (next.error || JSON.stringify(next.preferences.profile) !== JSON.stringify(parsed.data))
        throw new Error('PROFILE_NOT_CONFIRMED');
      latest.current = next;
      setValue(next.preferences.profile!);
      return true;
    } catch {
      if (alive.current)
        setError('Não foi possível salvar o perfil. Confira os dados e tente novamente.');
      return false;
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return { value, busy, error, save };
}
