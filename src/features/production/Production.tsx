import { ProductionDayDialog } from './ProductionDayDialog';
import { AppDialog } from '../../design/AppDialog';
import { ProductionCalendar } from './ProductionCalendar';
import { timezoneLabel } from '../../design/timezoneLabel';
import { useEffect, useRef, useState } from 'react';
import { HistoryDisclosure } from '../../design/HistoryDisclosure';
import { CompactSelect } from '../../design/CompactSelect';
import { DateField } from '../../design/DateField';
import type { GoalView, ProductionDayQuery } from '../../../shared/contracts/production';
import { useProduction, type ProductionModel } from './useProduction';
import { dateLabel, durationLabel, timeLabel } from './format';
function GoalEditor({
  view,
  model,
  close,
}: {
  view: GoalView;
  model: ProductionModel;
  close: () => void;
}) {
  const definition = view.pending ?? view.definition;
  const [none, setNone] = useState(!definition?.targetMs),
    [minutes, setMinutes] = useState(
      (definition?.targetMs ?? (view.cadence === 'daily' ? 60 : 300) * 60_000) / 60_000,
    ),
    [current, setCurrent] = useState(false);
  return (
    <AppDialog
      title={view.cadence === 'daily' ? 'Editar meta diária' : 'Editar meta semanal'}
      className="goal-dialog"
      onCancel={() => {
        if (!model.saving) close();
      }}
    >
      <form
        className="habit-form production-goal-form"
        aria-label={view.cadence === 'daily' ? 'Editar meta diária' : 'Editar meta semanal'}
        onSubmit={(event) => {
          event.preventDefault();
          void model.save(view.cadence, none ? null : minutes, current).then((ok) => {
            if (ok) close();
          });
        }}
      >
        <label className="habit-inline">
          <input
            autoFocus
            type="checkbox"
            checked={none}
            disabled={model.saving || model.blocked}
            onChange={(event) => setNone(event.target.checked)}
          />
          Sem meta
        </label>
        <label>
          Alvo em minutos
          <input
            type="number"
            min={1}
            max={view.cadence === 'daily' ? 1440 : 10080}
            required
            disabled={none || model.saving || model.blocked}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </label>
        <p>
          {view.cadence === 'daily'
            ? 'Por padrão, a mudança vale a partir de amanhã.'
            : 'Por padrão, a mudança vale na próxima segunda-feira.'}
        </p>
        <label className="habit-inline">
          <input
            type="checkbox"
            checked={current}
            disabled={model.saving || model.blocked}
            onChange={(event) => setCurrent(event.target.checked)}
          />
          Aplicar a partir de hoje ao período atual. Datas anteriores permanecem preservadas.
        </label>
        {model.goalError && (
          <div role="alert">
            {model.goalError}
            {model.blocked && (
              <button
                type="button"
                disabled={model.saving}
                onClick={() => {
                  void model.retry().then((ok) => {
                    if (ok) close();
                  });
                }}
              >
                Tentar confirmar novamente
              </button>
            )}
          </div>
        )}
        <div className="habit-actions">
          <button type="submit" disabled={model.saving || model.blocked}>
            Salvar meta
          </button>
          <button type="button" disabled={model.saving || model.blocked} onClick={close}>
            Cancelar
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
export function Production({ active }: { active: boolean }) {
  const model = useProduction(active),
    value = model.value;
  const [day, setDay] = useState<ProductionDayQuery | null>(null);
  const [editing, setEditing] = useState<'daily' | 'weekly' | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null),
    returnFocus = useRef(false);
  const historyHeading = useRef<HTMLHeadingElement>(null),
    previousPage = useRef(1);
  useEffect(() => {
    if (previousPage.current !== model.pageNumber) {
      previousPage.current = model.pageNumber;
      historyHeading.current?.focus({ preventScroll: true });
    }
  }, [model.pageNumber]);
  useEffect(() => {
    if (!editing && !model.loading && !model.saving && !model.blocked && returnFocus.current) {
      returnFocus.current = false;
      opener.current?.focus();
    }
  }, [editing, model.loading, model.saving, model.blocked]);
  const close = () => {
    returnFocus.current = true;
    setEditing(null);
  };
  if (!model.live) return null;
  const controlsBlocked = !!day || !!editing || model.saving || model.blocked;
  const readOnly =
    value &&
    (value.endDate !== value.today ||
      value.habits.find((habit) => habit.id === value.habitId)?.archived);
  return (
    <div
      className="production-route real-habits"
      aria-busy={model.loading}
      data-refresh={model.refreshSequence}
    >
      <div className="production-filters">
        <div className="form-field">
          <span>Período</span>
          <CompactSelect
            label="Período de Produção"
            disabled={controlsBlocked}
            value={String(model.query.days)}
            onChange={(value) => model.filter({ ...model.query, days: Number(value) })}
            options={[
              { value: '1', label: 'Hoje / um dia' },
              ...[7, 30, 90, 365].map((days) => ({ value: String(days), label: `${days} dias` })),
            ]}
          />
        </div>
        <div className="form-field">
          <span>Até</span>
          <DateField
            label="Data final de Produção"
            disabled={controlsBlocked || !model.today}
            today={model.today}
            max={model.today}
            value={model.query.endDate ?? model.today}
            onChange={(date) => model.filter({ ...model.query, endDate: date })}
          />
        </div>
        <div className="form-field">
          <span>Recorte</span>
          <CompactSelect
            label="Hábito em Produção"
            disabled={controlsBlocked}
            value={model.query.habitId ?? ''}
            onChange={(value) => model.filter({ ...model.query, habitId: value || null })}
            options={[
              { value: '', label: 'Todos os Focos' },
              ...model.options.map((habit) => ({
                value: habit.id,
                label: `${habit.name}${habit.archived ? ' (arquivado)' : ''}`,
              })),
            ]}
          />
        </div>
        <button
          disabled={model.loading || controlsBlocked}
          onClick={() => model.filter({ days: model.query.days, habitId: model.query.habitId })}
        >
          Voltar a hoje
        </button>
        <button
          disabled={model.loading || controlsBlocked}
          onClick={() => {
            void model.refresh();
          }}
        >
          Atualizar
        </button>
      </div>
      {model.error && (
        <div className="focus-message" role="alert">
          {model.error}
        </div>
      )}
      {model.updateAvailable && (
        <p role="status" className="habit-caption">
          Há mudanças para consultar. Use Atualizar para abrir uma nova lista; esta página mantém os
          registros da consulta anterior.
        </p>
      )}
      {model.loading && (
        <p role="status" className="habit-caption">
          Consultando registros locais…
        </p>
      )}
      {value && (
        <>
          <p className="habit-caption">
            {dateLabel(value.startDate)} a {dateLabel(value.endDate)}
            {value.endDate === value.today ? ' · Hoje ainda aberto' : ''}
          </p>
          <dl className="production-metrics">
            <div>
              <dt>Foco concluído</dt>
              <dd>{durationLabel(value.metrics.eligibleMs)}</dd>
            </div>
            <div>
              <dt>Sessões concluídas</dt>
              <dd>{value.metrics.sessions}</dd>
            </div>
            <div>
              <dt>Média por dia do período</dt>
              <dd>{durationLabel(value.metrics.averagePerDayMs)}</dd>
            </div>
            <div>
              <dt>Média por dia com foco</dt>
              <dd data-empty={value.metrics.averagePerActiveDayMs === null}>
                {value.metrics.averagePerActiveDayMs === null
                  ? 'Sem dias com foco'
                  : durationLabel(value.metrics.averagePerActiveDayMs)}
              </dd>
            </div>
          </dl>
          <ProductionCalendar
            days={value.daysData}
            onDay={(date) => setDay({ date, habitId: value.habitId, ceiling: value.ceiling })}
          />
          <div className="production-insights">
            <p className="production-comparison">
              {!value.previous.days
                ? 'Comparação disponível após encerrar o dia.'
                : value.previous.percentChange === null
                  ? 'Sem base no período anterior.'
                  : `${value.previous.percentChange >= 0 ? '+' : ''}${value.previous.percentChange.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em relação ao período anterior`}
            </p>
            <HistoryDisclosure title="Sobre estes totais">
              {() => (
                <>
                  <p className="habit-caption">
                    Foco concluído soma apenas sessões concluídas. Pausas e tempo offline não entram
                    nos totais. Datas dos registros preservadas · Referência atual:{' '}
                    {timezoneLabel(value.timezone)}.
                  </p>
                  <p className="habit-caption">
                    Tempo interrompido: {durationLabel(value.metrics.interruptedMs)} · Não incluído
                    em Foco concluído.
                  </p>
                  <p className="habit-caption">
                    Comparação de {value.previous.days} dias encerrados:{' '}
                    {durationLabel(value.previous.currentMs)}; período anterior:{' '}
                    {durationLabel(value.previous.previousMs)}.
                  </p>
                </>
              )}
            </HistoryDisclosure>
          </div>
          <div className="production-goals" aria-label="Metas de foco">
            {[value.goals.daily, value.goals.weekly].map((goal) => (
              <article
                key={goal.cadence}
                className="production-goal"
                data-unset={!goal.definition?.targetMs}
                aria-label={goal.cadence === 'daily' ? 'Meta diária' : 'Meta semanal'}
              >
                <div
                  className="production-ring"
                  aria-hidden="true"
                  style={{
                    background: `conic-gradient(var(--clean-focus) ${goal.ringPercent}%, var(--clean-data-border) 0)`,
                  }}
                >
                  <i />
                </div>
                <div>
                  <h2>{goal.cadence === 'daily' ? 'Meta diária' : 'Meta semanal'}</h2>
                  <p>
                    {goal.definition?.targetMs
                      ? `${durationLabel(goal.actualMs)} / ${durationLabel(goal.definition.targetMs)} · ${goal.percent!.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                      : 'Sem meta'}
                  </p>
                  <small>
                    {dateLabel(goal.startDate)} a {dateLabel(goal.endDate)}
                    {goal.definition ? ` · ${timezoneLabel(goal.definition.timezone)}` : ''}
                  </small>
                  {goal.pending && (
                    <p className="habit-caption">
                      A partir de {dateLabel(goal.pending.effectiveDate)}:{' '}
                      {goal.pending.targetMs ? durationLabel(goal.pending.targetMs) : 'Sem meta'}
                    </p>
                  )}
                  <button
                    className="goal-edit-action"
                    disabled={!!readOnly || model.loading || controlsBlocked}
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setEditing(goal.cadence);
                    }}
                  >
                    Editar {goal.cadence === 'daily' ? 'meta diária' : 'meta semanal'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {readOnly && (
            <p className="habit-caption">
              Metas de datas passadas ou de hábitos arquivados são somente leitura.
            </p>
          )}
          {editing && (
            <GoalEditor key={editing} view={value.goals[editing]} model={model} close={close} />
          )}
          {day && active && <ProductionDayDialog query={day} close={() => setDay(null)} />}
          <section className="production-history" aria-label="Histórico de sessões">
            <h2 ref={historyHeading} tabIndex={-1}>
              Histórico de sessões
            </h2>
            {!value.history.length ? (
              <p>Nenhuma sessão de foco neste período.</p>
            ) : (
              <ul>
                {value.history.map((session) => (
                  <li key={session.id}>
                    <div>
                      <time dateTime={new Date(session.completedUtcMs).toISOString()}>
                        {dateLabel(session.completionDate)} ·{' '}
                        {timeLabel(session.completedUtcMs, session.timezone)}
                      </time>
                      <strong>
                        {session.phase === 'free' ? 'Livre' : 'Foco'} ·{' '}
                        {session.outcome === 'completed' ? 'Concluído' : 'Interrompido'}
                      </strong>
                      <small>
                        {session.habitName ?? 'Sem vínculo'} · {timezoneLabel(session.timezone)}
                      </small>
                    </div>
                    <span>
                      {durationLabel(
                        session.outcome === 'completed' ? session.eligibleMs : session.activeMs,
                      )}
                      {session.outcome === 'interrupted' ? ' · sem crédito' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(model.pageNumber > 1 || value.nextCursor) && (
              <nav className="session-pagination" aria-label="Paginação do histórico">
                <button
                  disabled={model.loading || model.pageNumber === 1 || controlsBlocked}
                  onClick={() => {
                    void model.page(true);
                  }}
                >
                  Página anterior
                </button>
                <span>Página {model.pageNumber}</span>
                <button
                  disabled={model.loading || !value.nextCursor || controlsBlocked}
                  onClick={() => {
                    void model.page(false);
                  }}
                >
                  Próxima página
                </button>
              </nav>
            )}
          </section>
        </>
      )}
    </div>
  );
}
