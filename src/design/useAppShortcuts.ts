import { useEffect, useEffectEvent } from 'react';
export function useAppShortcuts({
  shortcut,
  navigate,
  toggleMini,
}: {
  shortcut: 'ctrl-space' | 'ctrl-shift-space' | 'off';
  navigate: (index: number) => void;
  toggleMini: () => void;
}) {
  const perform = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.isComposing ||
      event.defaultPrevented ||
      document.visibilityState !== 'visible' ||
      (event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable=true]'))
    )
      return;
    if (document.querySelector('dialog[open], [popover]:popover-open')) {
      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === 'Space' &&
        shortcut !== 'off' &&
        event.shiftKey === (shortcut === 'ctrl-shift-space')
      )
        event.preventDefault();
      return;
    }
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      /^[1-4]$/.test(event.key)
    ) {
      event.preventDefault();
      navigate(Number(event.key) - 1);
    } else if (
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.code === 'Comma' &&
      !event.shiftKey
    ) {
      const target = document.querySelector<HTMLButtonElement>('.settings-popover > button');
      if (target?.checkVisibility() && !target.closest('[inert]')) {
        event.preventDefault();
        target.click();
      }
    } else if (
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.shiftKey &&
      event.code === 'KeyM'
    ) {
      event.preventDefault();
      toggleMini();
    } else if (
      shortcut !== 'off' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.code === 'Space' &&
      event.shiftKey === (shortcut === 'ctrl-shift-space')
    ) {
      event.preventDefault();
      document
        .querySelector<HTMLButtonElement>(
          '.mini-timer button[data-timer-primary], .clean-focus:not([hidden]) .clean-primary',
        )
        ?.click();
    }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => perform(event);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
