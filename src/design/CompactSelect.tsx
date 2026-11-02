import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}
export function CompactSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  busy = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const id = useId(),
    anchor = `--choice-${id.replace(/\W/g, '')}`;
  const popup = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const shown = options.filter((option) =>
    option.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  useLayoutEffect(() => {
    if (open) {
      const element =
        popup.current?.querySelector<HTMLElement>(
          options.length > 8 ? 'input' : '[aria-selected=true]',
        ) ?? popup.current?.querySelector<HTMLElement>('[role=option]');
      element?.focus();
    }
  }, [open, options.length]);
  function move(event: KeyboardEvent) {
    const buttons = Array.from(
      popup.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Tab') popup.current?.hidePopover();
    else if (
      event.key.length === 1 &&
      event.target instanceof HTMLButtonElement &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key !== ' '
    ) {
      const ordered = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)];
      ordered
        .find((button) =>
          button.textContent
            ?.trim()
            .toLocaleLowerCase('pt-BR')
            .startsWith(event.key.toLocaleLowerCase('pt-BR')),
        )
        ?.focus();
    }
  }
  return (
    <span className="compact-select">
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        aria-expanded={open}
        aria-busy={busy}
        disabled={disabled}
        aria-disabled={busy}
        popoverTarget={id}
        style={{ anchorName: anchor }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            popup.current?.showPopover();
          }
        }}
      >
        <span>{options.find((option) => option.value === value)?.label ?? 'Selecionar'}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        className="choice-popover"
        style={{ positionAnchor: anchor }}
        onKeyDown={move}
        onToggle={(event) => {
          const expanded = (event.nativeEvent as ToggleEvent).newState === 'open';
          setOpen(expanded);
          if (expanded) setQuery('');
        }}
      >
        {open && options.length > 8 && (
          <input
            aria-label={`Buscar: ${label}`}
            placeholder="Buscar…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        <div id={`${id}-list`} role="listbox" aria-label={label}>
          {open &&
            shown.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                data-value={option.value}
                key={option.value}
                onClick={() => {
                  if (busy || disabled) return;
                  onChange(option.value);
                  popup.current?.hidePopover();
                  trigger.current?.focus();
                }}
              >
                <span>{option.label}</span>
                {value === option.value && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          {open && !shown.length && <p role="status">Nenhum resultado.</p>}
        </div>
      </div>
    </span>
  );
}
