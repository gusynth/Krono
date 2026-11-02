import { X } from 'lucide-react';
import { civilDate } from '../../../shared/domain/habits';
import { useEffect, useState } from 'react';
import { AppDialog } from '../../design/AppDialog';
import {
  productionDaySchema,
  type ProductionDay,
  type ProductionDayQuery,
} from '../../../shared/contracts/production';
import { dateLabel, durationLabel, timeLabel } from './format';
import { timezoneLabel } from '../../design/timezoneLabel';
export function ProductionDayDialog({
  query,
  close,
}: {
  query: ProductionDayQuery;
  close: () => void;
}) {
  const [page, setPage] = useState(query),
    [result, setResult] = useState<{ page: ProductionDayQuery; value: ProductionDay } | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    void window
      .krono!.production!.day(page)
      .then((input) => {
        const next = productionDaySchema.parse(input);
        if (alive) {
          setResult({ page, value: next });
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [page, retry]);
  const value = result?.value,
    loading = result?.page !== page;
  return (
    <AppDialog
      title={`Sessões de ${dateLabel(query.date)}`}
      className="production-day-dialog"
      onCancel={close}
    >
      <button
        data-dialog-cancel
        className="day-dialog-close"
        onClick={close}
        aria-label="Fechar detalhes do dia"
      >
        <X size={18} aria-hidden="true" />
      </button>
      <div className="day-dialog-body" aria-busy={loading && !error}>
        <p className="habit-caption">
          Datas dos registros preservadas. Sessões que atravessam a meia-noite podem contribuir para
          mais de um dia.
        </p>
        {error ? (
          <p role="alert">
            Não foi possível consultar este dia. Os registros foram preservados.{' '}
            <button
              onClick={() => {
                setError(false);
                setRetry((n) => n + 1);
              }}
            >
              Tentar novamente
            </button>
          </p>
        ) : !value || loading ? (
          <p role="status">Consultando sessões…</p>
        ) : (
          <>
            <dl className="day-totals">
              <div>
                <dt>Foco concluído neste dia</dt>
                <dd>{durationLabel(value.eligibleMs)}</dd>
              </div>
              <div>
                <dt>Interrompido · sem crédito</dt>
                <dd>{durationLabel(value.interruptedMs)}</dd>
              </div>
            </dl>
            {!value.history.length ? (
              <p>Nenhuma sessão neste dia.</p>
            ) : (
              <ul className="day-sessions">
                {value.history.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.outcome === 'completed' ? 'Concluído' : 'Interrompido'} ·{' '}
                      {item.habitName ?? 'Sem vínculo'}
                    </strong>
                    <span>
                      {dateLabel(civilDate(item.startedUtcMs, item.timezone))}{' '}
                      {timeLabel(item.startedUtcMs, item.timezone)} →{' '}
                      {dateLabel(item.completionDate)}{' '}
                      {timeLabel(item.completedUtcMs, item.timezone)} ·{' '}
                      {timezoneLabel(item.timezone)}
                    </span>
                    <span>
                      {item.outcome === 'completed'
                        ? `${durationLabel(item.dayCreditMs)} creditados neste dia · ${durationLabel(item.eligibleMs)} na sessão`
                        : `${durationLabel(item.activeMs)} interrompidos, sem crédito`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(page.cursor || value.nextCursor) && (
              <nav className="session-pagination" aria-label="Paginação de sessões do dia">
                <button disabled={!page.cursor || loading} onClick={() => setPage(query)}>
                  Primeira página
                </button>
                <button
                  disabled={!value.nextCursor || loading}
                  onClick={() => {
                    if (value.nextCursor) setPage({ ...query, cursor: value.nextCursor });
                  }}
                >
                  Próxima página
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </AppDialog>
  );
}
