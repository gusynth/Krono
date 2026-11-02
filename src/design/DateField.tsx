import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays } from '../../shared/domain/habits';
import {
  displayDate,
  monthGrid,
  parseDisplayDate,
  shiftMonth,
} from '../../shared/domain/date-picker';
import { localDateSchema } from '../../shared/contracts/habits';

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthName = (date: string) => monthFormatter.format(new Date(`${date}T12:00:00Z`));
const dateName = (date: string) => dateFormatter.format(new Date(`${date}T12:00:00Z`));

export function DateField({
  label,
  value,
  today,
  min,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  today: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  onChange: (date: string) => void;
}) {
  const id = useId(),
    anchor = `--date-${id.replace(/\W/g, '')}`;
  const popup = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null),
    moveFocus = useRef(false);
  const [edit, setEdit] = useState({ source: value, text: displayDate(value) }),
    [message, setError] = useState(''),
    [open, setOpen] = useState(false),
    [cursor, setCursor] = useState(value || today || '2000-01-01');
  const draft = edit.source === value ? edit.text : displayDate(value),
    error = edit.source === value ? message : '';
  const setDraft = (text: string) => setEdit({ source: value, text });
  useEffect(() => {
    if (edit.source !== value) input.current?.setCustomValidity('');
  }, [value, edit.source]);
  useLayoutEffect(() => {
    if (open && moveFocus.current) {
      moveFocus.current = false;
      popup.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus();
    }
  }, [open, cursor]);
  const allowed = (date: string) =>
    localDateSchema.safeParse(date).success && (!max || date <= max) && (!min || date >= min);
  function choose(date: string) {
    if (disabled || !allowed(date)) return;
    onChange(date);
    setDraft(displayDate(date));
    setError('');
    input.current?.setCustomValidity('');
    popup.current?.hidePopover();
    trigger.current?.focus();
  }
  function keyboard(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.date) return;
    const day = (new Date(`${cursor}T12:00:00Z`).getUTCDay() + 6) % 7;
    const next =
      event.key === 'ArrowLeft'
        ? addDays(cursor, -1)
        : event.key === 'ArrowRight'
          ? addDays(cursor, 1)
          : event.key === 'ArrowUp'
            ? addDays(cursor, -7)
            : event.key === 'ArrowDown'
              ? addDays(cursor, 7)
              : event.key === 'Home'
                ? addDays(cursor, -day)
                : event.key === 'End'
                  ? addDays(cursor, 6 - day)
                  : event.key === 'PageUp'
                    ? shiftMonth(cursor, event.shiftKey ? -12 : -1)
                    : event.key === 'PageDown'
                      ? shiftMonth(cursor, event.shiftKey ? 12 : 1)
                      : null;
    if (next) {
      event.preventDefault();
      const target =
        min && event.key === 'PageUp' && next.slice(0, 7) === min.slice(0, 7) && next < min
          ? min
          : max && event.key === 'PageDown' && next.slice(0, 7) === max.slice(0, 7) && next > max
            ? max
            : next;
      if (allowed(target)) {
        moveFocus.current = true;
        setCursor(target);
      }
    }
  }
  const days = monthGrid(cursor),
    previous = shiftMonth(cursor, -1),
    next = shiftMonth(cursor, 1);
  return (
    <div className="date-field">
      <div className="date-control" style={{ anchorName: anchor }}>
        <input
          ref={input}
          type="text"
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          required
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            const text = event.target.value,
              date = parseDisplayDate(text);
            setDraft(text);
            const message =
              date && allowed(date)
                ? ''
                : date && min && date < min
                  ? `Escolha uma data a partir de ${displayDate(min)}.`
                  : date && max && date > max
                    ? 'Escolha uma data até hoje.'
                    : 'Informe uma data válida em dd/mm/aaaa.';
            event.target.setCustomValidity(message);
            if (!message && date) {
              setError('');
              onChange(date);
            }
          }}
          onBlur={() => {
            if (input.current?.validationMessage) setError(input.current.validationMessage);
          }}
        />
        <button
          ref={trigger}
          type="button"
          aria-label={`Abrir calendário: ${label}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={id}
          popoverTarget={id}
          disabled={disabled}
        >
          <CalendarDays size={17} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <small id={`${id}-error`} role="alert">
          {error}
        </small>
      )}
      <div
        id={id}
        ref={popup}
        popover="auto"
        role="dialog"
        aria-label={`Calendário: ${label}`}
        className="date-popover"
        style={{ positionAnchor: anchor }}
        onBeforeToggle={(event) => {
          if ((event.nativeEvent as ToggleEvent).newState === 'open') {
            setCursor(value || today);
            moveFocus.current = true;
          }
        }}
        onToggle={(event) => setOpen((event.nativeEvent as ToggleEvent).newState === 'open')}
        onKeyDown={keyboard}
      >
        {open && (
          <>
            <div className="date-month">
              <button
                type="button"
                aria-label="Mês anterior"
                disabled={previous === cursor || (!!min && previous.slice(0, 7) < min.slice(0, 7))}
                onClick={() => setCursor(min && previous < min ? min : previous)}
              >
                <ChevronLeft size={17} />
              </button>
              <h3 aria-live="polite">{monthName(cursor)}</h3>
              <button
                type="button"
                aria-label="Próximo mês"
                disabled={next === cursor || (!!max && next.slice(0, 7) > max.slice(0, 7))}
                onClick={() => setCursor(max && next > max ? max : next)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <div role="grid" aria-label={monthName(cursor)}>
              <div role="row" className="date-week">
                {weekdays.map((day) => (
                  <span role="columnheader" key={day}>
                    {day}
                  </span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, row) => (
                <div role="row" className="date-week" key={row}>
                  {days.slice(row * 7, row * 7 + 7).map((date, column) =>
                    date ? (
                      <button
                        key={date}
                        type="button"
                        role="gridcell"
                        data-date={date}
                        data-outside={date.slice(0, 7) !== cursor.slice(0, 7)}
                        aria-label={dateName(date)}
                        aria-selected={date === value}
                        aria-current={date === today ? 'date' : undefined}
                        tabIndex={date === cursor ? 0 : -1}
                        disabled={!allowed(date)}
                        onClick={() => choose(date)}
                      >
                        {Number(date.slice(8))}
                      </button>
                    ) : (
                      <span role="gridcell" key={column} />
                    ),
                  )}
                </div>
              ))}
            </div>
            <div className="date-footer">
              <span>dd/mm/aaaa</span>
              <button type="button" disabled={!allowed(today)} onClick={() => choose(today)}>
                Hoje
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
