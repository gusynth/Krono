import { useEffect, useState } from 'react';
import { isTheme, type Theme } from './themes';
type Appearance = {
  rememberPage: boolean;
  navigation: 'side' | 'top';
  navCollapsed: boolean;
  reducedMotion: boolean;
  reducedEffects: boolean;
  ambient: boolean;
  theme: Theme;
  shortcut: 'ctrl-space' | 'ctrl-shift-space' | 'off';
};
const key = 'krono.appearance.v1';
const defaults: Appearance = {
  rememberPage: false,
  navigation: 'side',
  navCollapsed: false,
  reducedMotion: false,
  reducedEffects: false,
  ambient: true,
  theme: 'original',
  shortcut: 'ctrl-space',
};
export function useAppearancePreferences() {
  const [value, setValue] = useState<Appearance>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      return saved &&
        typeof saved.reducedMotion === 'boolean' &&
        typeof saved.reducedEffects === 'boolean'
        ? {
            rememberPage: saved.rememberPage === true,
            navigation: saved.navigation === 'top' ? 'top' : 'side',
            navCollapsed: saved.navCollapsed === true,
            reducedMotion: saved.reducedMotion,
            reducedEffects: saved.reducedEffects,
            ambient: typeof saved.ambient === 'boolean' ? saved.ambient : true,
            theme: isTheme(saved.theme) ? saved.theme : 'original',
            shortcut: ['ctrl-space', 'ctrl-shift-space', 'off'].includes(saved.shortcut)
              ? saved.shortcut
              : 'ctrl-space',
          }
        : defaults;
    } catch {
      return defaults;
    }
  });
  const [nativeError, setNativeError] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Aparência funciona em memória se o armazenamento não estiver disponível. */
    }
  }, [value]);
  useEffect(() => {
    let alive = true;
    void window.krono
      ?.windowTheme?.(value.theme)
      .then(() => {
        if (alive) setNativeError(null);
      })
      .catch(() => {
        if (alive) setNativeError('Não foi possível aplicar a cor à moldura da janela.');
      });
    return () => {
      alive = false;
    };
  }, [value.theme]);
  function update(patch: Partial<Appearance>) {
    setValue((previous) => ({ ...previous, ...patch }));
  }
  return { ...value, update, nativeError };
}
export type AppearancePreferences = ReturnType<typeof useAppearancePreferences>;
