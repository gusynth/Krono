import { type ReactNode, useId } from 'react';
export function StudyPopover({
  trigger,
  label,
  className = '',
  children,
  onOpen,
}: {
  trigger: ReactNode;
  label: string;
  className?: string;
  children: ReactNode;
  onOpen?: () => void;
}) {
  const id = useId();
  return (
    <div className={`study-popover-anchor ${className}`}>
      <button className="study-popover-trigger" popoverTarget={id} aria-label={label}>
        {trigger}
      </button>
      <div
        id={id}
        popover="auto"
        className="study-popover"
        role="region"
        aria-label={label}
        onBeforeToggle={(event) => {
          if ((event.nativeEvent as ToggleEvent).newState === 'open') onOpen?.();
        }}
      >
        {children}
      </div>
    </div>
  );
}
