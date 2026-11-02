import { useState, type ReactNode } from 'react';

/** Mantém o disclosure nativo; listas só ocupam o DOM quando consultadas. */
export function HistoryDisclosure({
  title,
  children,
}: {
  title: string;
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{title}</summary>
      {open && <div className="history-content">{children()}</div>}
    </details>
  );
}
