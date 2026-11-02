import { useEffect, useEffectEvent, useId, useRef, type ReactNode, type RefObject } from 'react';

export function AppDialog({
  title,
  onCancel,
  children,
  restoreFocus,
  alert = false,
  className = '',
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
  restoreFocus?: RefObject<boolean>;
  alert?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId();
  const returnToOpener = useEffectEvent((opener: HTMLElement | null) => {
    if (
      (restoreFocus?.current ?? true) &&
      document.visibilityState === 'visible' &&
      opener?.isConnected
    )
      opener.focus();
  });
  useEffect(() => {
    const element = dialog.current!,
      opener = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLElement>('[data-dialog-cancel]')?.focus();
    return () => {
      element.close();
      returnToOpener(opener);
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`app-dialog ${className}`}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={heading}>{title}</h2>
      {children}
    </dialog>
  );
}
