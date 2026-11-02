import { useRef, useState } from 'react';
import { addDays } from '../../../shared/domain/habits';
import { dailyHabitReview } from '../../../shared/domain/daily-review';
import type { ProductionDayQuery } from '../../../shared/contracts/production';
import { DateField } from '../../design/DateField';
import type { HabitsModel } from '../habits/useHabits';
import { useProduction } from '../production/useProduction';
import { ProductionDayDialog } from '../production/ProductionDayDialog';
import { durationLabel } from '../production/format';

const statusLabel = {
  completed: 'Concluído',
  pending: 'Pendente',
  missed: 'Não concluído',
  rest: 'Descanso',
  future: 'Futuro',
  'not-applicable': 'Não aplicável',
};

export function DailyReview({
  active,
  today,
  habits,
  onHabits,
}: {
  active: boolean;
  today: string;
  habits: HabitsModel;
  onHabits?: () => void;
}) {
  const production = useProduction(active, 1, today);
  const [selection, setSelection] = useState<string | null>(null),
    [day, setDay] = useState<ProductionDayQuery | null>(null);
  const details = useRef<HTMLButtonElement>(null);
  const minimum = addDays(today, -27),
    date = selection && selection >= minimum && selection <= today ? selection : today;
  // Follow midnight only when reviewing today; historical selections stay fixed.
  const [requested, setRequested] = useState(date);
  if (requested !== date) {
    setRequested(date);
    production.filter({ days: 1, endDate: date, habitId: null });
    setDay(null);
  }
  if (!active && day) setDay(null);
  const value = production.value?.endDate === date ? production.value : null;
  const review = habits.value ? dailyHabitReview(habits.value.habits, date) : null;
  const close = () => {
    setDay(null);
    details.current?.focus();
  };
  return (
    <section className="daily-review real-habits" aria-labelledby="daily-review-title">
      <div className="daily-review-heading">
        <div>
          <h2 id="daily-review-title">Revisão diária</h2>
          <p>
            {date === today ? 'Seu dia, até agora' : 'Resumo do dia selecionado'} · últimos 28 dias
          </p>
        </div>
        <div className="daily-review-date">
          <DateField
            label="Dia da revisão"
            value={date}
            today={today}
            min={minimum}
            max={today}
            onChange={(next) => setSelection(next === today ? null : next)}
          />
        </div>
      </div>
      <div
        className="daily-review-content"
        data-refresh={production.refreshSequence}
        aria-busy={production.loading}
      >
        {production.error ? (
          <p role="alert">
            {production.error}{' '}
            <button
              onClick={() => {
                void production.refresh();
              }}
            >
              Tentar novamente
            </button>
          </p>
        ) : !value ? (
          <p role="status">Consultando o dia…</p>
        ) : (
          <>
            <dl className="daily-review-metrics">
              <div>
                <dt>Foco concluído</dt>
                <dd>{durationLabel(value.metrics.eligibleMs)}</dd>
              </div>
              <div>
                <dt>Sessões concluídas</dt>
                <dd>{value.metrics.sessions}</dd>
              </div>
              <div>
                <dt>Hábitos concluídos</dt>
                <dd>
                  {habits.error
                    ? 'Indisponível'
                    : review
                      ? review.planned.length
                        ? `${review.completed} de ${review.planned.length}`
                        : 'Nenhum previsto'
                      : 'Carregando…'}
                </dd>
              </div>
              <div>
                <dt>Meta do dia consultado</dt>
                <dd>
                  {value.goals.daily.definition?.targetMs
                    ? `${Math.round(value.goals.daily.percent ?? 0)}%`
                    : 'Sem meta'}
                </dd>
                {value.goals.daily.definition?.targetMs && (
                  <small>
                    {durationLabel(value.goals.daily.actualMs)} de{' '}
                    {durationLabel(value.goals.daily.definition.targetMs)}
                  </small>
                )}
              </div>
            </dl>
            <div className="daily-review-actions">
              <button
                ref={details}
                className="daily-review-details"
                onClick={() => setDay({ date, habitId: null, ceiling: value.ceiling })}
              >
                Ver sessões deste dia
              </button>
              {date === today && onHabits && (
                <button className="profile-summary-link" onClick={onHabits}>
                  Ver hábitos de hoje
                </button>
              )}
            </div>
          </>
        )}
        {habits.error ? (
          <p role="alert">
            Não foi possível consultar os hábitos.{' '}
            <button
              onClick={() => {
                void habits.refresh();
              }}
            >
              Tentar novamente
            </button>
          </p>
        ) : (
          review && (
            <>
              {!!review.planned.length && (
                <details className="daily-review-habits">
                  <summary>Hábitos previstos neste dia ({review.planned.length})</summary>
                  <ul>
                    {review.planned.map((entry) => (
                      <li key={entry.id}>
                        <span>{entry.name}</span>
                        <span data-status={entry.day!.status}>
                          {statusLabel[entry.day!.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!!review.unavailable && (
                <p className="habit-caption">
                  {review.unavailable} hábito(s) sem informação disponível para esta data no próprio
                  fuso.
                </p>
              )}
            </>
          )
        )}
        <details className="daily-review-explanation">
          <summary>Sobre os registros deste dia</summary>
          <p className="daily-review-note">
            O foco segue as datas preservadas de cada sessão; o contador usa o dia da conclusão.
            Hábitos seguem seus próprios fusos. Hábitos excluídos não aparecem na revisão.
          </p>
        </details>
      </div>
      {active && day && <ProductionDayDialog query={day} close={close} />}
    </section>
  );
}
