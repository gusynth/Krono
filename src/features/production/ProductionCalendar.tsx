import { useState } from 'react';
import type { ProductionSnapshot } from '../../../shared/contracts/production';
import { HistoryDisclosure } from '../../design/HistoryDisclosure';
import { dateLabel, durationLabel } from './format';
const intensities = [0, 16, 30, 78, 100];

export function ProductionCalendar({
  days,
  onDay,
}: {
  days: ProductionSnapshot['daysData'];
  onDay: (date: string) => void;
}) {
  const [focused, setFocused] = useState('');
  const tabDate = days.some((d) => d.date === focused) ? focused : days.at(-1)?.date;
  const offset = days.length ? (new Date(`${days[0]!.date}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const weeks = Math.max(1, Math.ceil((offset + days.length) / 7)),
    long = days.length > 35;
  const maximum = Math.max(1, ...days.map((day) => day.durationMs));
  return (
    <section className="production-days" aria-label="Foco por dia">
      <h2>Foco concluído por dia</h2>
      <div className="production-calendar-grid">
        <div className="production-weekdays" hidden={long} aria-hidden="true">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, index) => (
            <span key={index}>{day}</span>
          ))}
        </div>
        <div
          className="production-heatmap"
          data-long={long}
          style={
            long
              ? {
                  gridTemplateColumns: `repeat(${weeks},minmax(0,1fr))`,
                  gridTemplateRows: 'repeat(7,auto)',
                  gridAutoFlow: 'column',
                }
              : undefined
          }
        >
          {Array.from({ length: offset }, (_, index) => (
            <span className="calendar-spacer" key={`pad-${index}`} />
          ))}
          {days.map((day) => {
            const level = day.durationMs ? Math.ceil((day.durationMs / maximum) * 4) : 0;
            return (
              <button
                type="button"
                tabIndex={day.date === tabDate ? 0 : -1}
                onFocus={() => setFocused(day.date)}
                onKeyDown={(event) => {
                  const index = days.findIndex((d) => d.date === day.date);
                  const delta = (
                    (long
                      ? { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }
                      : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }) as Record<
                      string,
                      number
                    >
                  )[event.key];
                  if (delta !== undefined || event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? days.length - 1
                          : Math.max(0, Math.min(days.length - 1, index + delta!));
                    (
                      event.currentTarget.parentElement?.querySelectorAll('button')[next] as
                        HTMLButtonElement | undefined
                    )?.focus();
                  }
                }}
                onClick={() => onDay(day.date)}
                aria-label={`Ver sessões de ${dateLabel(day.date)}: ${durationLabel(day.durationMs)}`}
                key={day.date}
                title={`${dateLabel(day.date)} — ${durationLabel(day.durationMs)}`}
                data-empty={!day.durationMs}
                style={
                  level
                    ? {
                        background: `color-mix(in srgb,var(--clean-focus) ${intensities[level]}%,var(--clean-surface))`,
                        color: level <= 2 ? 'var(--clean-text)' : 'var(--clean-ink)',
                      }
                    : undefined
                }
              >
                {!long && <span>{Number(day.date.slice(8))}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="production-intensity" aria-label="Quatro intensidades relativas de foco">
        <span>Menos foco</span>
        {intensities.map((level) => (
          <i
            key={level}
            aria-hidden="true"
            style={{
              background: level
                ? `color-mix(in srgb,var(--clean-focus) ${level}%,var(--clean-surface))`
                : 'var(--ui-inset)',
            }}
          />
        ))}
        <span>Mais foco</span>
      </div>
      <p className="habit-caption">
        {long ? 'Semanas em colunas, de segunda a domingo. ' : 'Cada célula representa um dia. '}
        Intensidade relativa ao maior tempo do período; vazio indica ausência de foco concluído.
      </p>
      <HistoryDisclosure title="Consultar dias em lista">
        {() => (
          <ol className="habit-history">
            {days.map((day) => (
              <li key={day.date}>
                <button onClick={() => onDay(day.date)}>{dateLabel(day.date)}</button>
                <span>{durationLabel(day.durationMs)}</span>
              </li>
            ))}
          </ol>
        )}
      </HistoryDisclosure>
    </section>
  );
}
