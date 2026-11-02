import { finishEstimate } from '../../../shared/domain/finish-estimate';
export function FinishEstimate({
  state,
  remaining,
  now,
}: {
  state: string;
  remaining: number | null;
  now: number;
}) {
  const end = finishEstimate(state, remaining, now);
  const day = end === null ? false : new Date(now).toDateString() !== new Date(end).toDateString();
  return (
    <span
      className="finish-estimate"
      title="Previsão no horário do computador; não altera a contagem da sessão"
      aria-live="off"
    >
      {end !== null
        ? `Termina ${day ? 'em ' + new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(end) + ' ' : ''}às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(end)}`
        : state === 'paused'
          ? 'Previsão atualizada ao retomar'
          : null}
    </span>
  );
}
