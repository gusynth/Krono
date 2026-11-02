import { AppDialog } from '../../design/AppDialog';
import { useEffect, useRef, useState } from 'react';
import { Plus, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { DateField } from '../../design/DateField';
import { HabitGlyph, HabitIconPicker } from '../../design/HabitIconPicker';
import type { HabitIconId } from '../../../shared/contracts/habit-icon';
import { HistoryDisclosure } from '../../design/HistoryDisclosure';
import { CompactSelect } from '../../design/CompactSelect';
import type { Frequency, HabitInput, HabitView } from '../../../shared/contracts/habits';
import { useDesktop } from '../settings/useDesktop';
import { orderedHabits, moveHabit } from '../../../shared/domain/habit-order';
import type { HabitsModel } from './useHabits';

const dateLabel = (value: string) => value.split('-').reverse().join('/');
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const states = {
  completed: 'Concluído',
  pending: 'Pendente hoje',
  missed: 'Não concluído',
  rest: 'Descanso',
  future: 'Futuro',
  'not-applicable': 'Não aplicável',
};
const frequencyName = (frequency: Frequency) =>
  frequency.kind === 'daily'
    ? 'Diário'
    : frequency.kind === 'weekdays'
      ? 'Dias úteis'
      : frequency.kind === 'alternate'
        ? 'Dia sim, dia não'
        : frequency.days.map((day) => weekdays[day]).join(', ');

function HabitForm({
  habit,
  today,
  model,
  close,
}: {
  habit: HabitView | null;
  today: string;
  model: HabitsModel;
  close: () => void;
}) {
  const editableFrequency = habit?.nextFrequency ?? habit?.frequency;
  const localToday = habit?.today.date ?? today;
  const [name, setName] = useState(habit?.name ?? ''),
    [kind, setKind] = useState<'action' | 'time'>(habit?.kind ?? 'action');
  const [frequency, setFrequency] = useState<Frequency['kind']>(editableFrequency?.kind ?? 'daily');
  const [days, setDays] = useState(
    editableFrequency?.kind === 'specific' ? editableFrequency.days : [1, 2, 3, 4, 5],
  );
  const [anchor, setAnchor] = useState(
    editableFrequency?.kind === 'alternate' ? editableFrequency.anchor : localToday,
  );
  const [minutes, setMinutes] = useState(habit?.nextTargetMinutes ?? habit?.targetMinutes ?? 25),
    [applyToday, setApplyToday] = useState(false);
  const [validation, setValidation] = useState('');
  const [icon, setIcon] = useState<HabitIconId | undefined>(habit?.icon);
  const id = useRef(habit?.id ?? crypto.randomUUID());
  async function save(event: React.SubmitEvent) {
    event.preventDefault();
    if (frequency === 'specific' && !days.length) {
      setValidation('Escolha pelo menos um dia.');
      return;
    }
    const input: HabitInput = {
      name,
      kind,
      icon: icon ?? (kind === 'time' ? 'timer' : 'book'),
      targetMinutes: minutes,
      frequency:
        frequency === 'specific'
          ? { kind: frequency, days }
          : frequency === 'alternate'
            ? { kind: frequency, anchor }
            : { kind: frequency },
    };
    if (await model.send(habit ? 'edit' : 'create', id.current, { input, applyToday })) close();
  }
  return (
    <form
      className="habit-form"
      aria-label={habit ? 'Editar hábito' : 'Criar hábito'}
      onSubmit={(event) => {
        void save(event);
      }}
    >
      <h2>{habit ? 'Editar hábito' : 'Novo hábito'}</h2>
      <div className="habit-name-row">
        <label>
          Nome
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <HabitIconPicker
          value={icon ?? (kind === 'time' ? 'timer' : 'book')}
          onChange={setIcon}
          disabled={model.busy || model.blocked}
        />
      </div>
      <div className="form-field">
        <span>Tipo</span>
        <CompactSelect
          label="Tipo"
          value={kind}
          disabled={!!habit || model.busy}
          onChange={(value) => setKind(value as 'action' | 'time')}
          options={[
            { value: 'action', label: 'Ação — conclusão manual' },
            { value: 'time', label: 'Tempo — Focos concluídos' },
          ]}
        />
      </div>
      <div className="form-field">
        <span>Frequência</span>
        <CompactSelect
          label="Frequência"
          value={frequency}
          disabled={model.busy}
          onChange={(value) => setFrequency(value as Frequency['kind'])}
          options={[
            { value: 'daily', label: 'Diário' },
            { value: 'weekdays', label: 'Dias úteis' },
            { value: 'specific', label: 'Dias específicos' },
            { value: 'alternate', label: 'Dia sim, dia não' },
          ]}
        />
      </div>
      {frequency === 'specific' && (
        <fieldset>
          <legend>Dias previstos</legend>
          {weekdays.map((day, index) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={days.includes(index)}
                onChange={(event) =>
                  setDays(
                    event.target.checked
                      ? [...days, index].sort()
                      : days.filter((value) => value !== index),
                  )
                }
              />
              {day}
            </label>
          ))}
        </fieldset>
      )}
      {frequency === 'alternate' && (
        <div className="form-field">
          <span>Data âncora (dia ativo)</span>
          <DateField
            label="Data âncora (dia ativo)"
            value={anchor}
            today={localToday}
            disabled={model.busy || model.blocked}
            onChange={setAnchor}
          />
        </div>
      )}
      {kind === 'time' && (
        <label>
          Meta por ocorrência (minutos)
          <input
            type="number"
            required
            min={1}
            max={480}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </label>
      )}
      {habit && (
        <>
          <p>Nome e ícone mudam agora. Frequência e meta valem a partir de amanhã.</p>
          <label className="habit-inline">
            <input
              type="checkbox"
              checked={applyToday}
              onChange={(event) => setApplyToday(event.target.checked)}
            />
            Aplicar frequência e meta hoje; recalcular a ocorrência de hoje.
          </label>
        </>
      )}
      {validation && <p role="alert">{validation}</p>}
      <div className="habit-actions">
        <button type="submit" disabled={model.busy || model.blocked}>
          Salvar hábito
        </button>
        <button type="button" disabled={model.busy || model.blocked} onClick={close}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function Habits({ model, onFocus }: { model: HabitsModel; onFocus: () => void }) {
  const [editing, setEditing] = useState<HabitView | null | undefined>(),
    [archived, setArchived] = useState(false);
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('krono.habits.compact') === 'true';
    } catch {
      return false;
    }
  });
  const desktop = useDesktop();
  const [organizing, setOrganizing] = useState(false),
    [filter, setFilter] = useState('all'),
    [announcement, setAnnouncement] = useState('');
  const [search, setSearch] = useState(''),
    [limit, setLimit] = useState(20);
  const grid = useRef<HTMLDivElement>(null),
    previousLimit = useRef(20);
  useEffect(() => {
    if (limit > previousLimit.current)
      (grid.current?.children[previousLimit.current] as HTMLElement | undefined)?.focus();
    previousLimit.current = limit;
  }, [limit]);
  const [deleting, setDeleting] = useState(false),
    [confirmedDelete, setConfirmedDelete] = useState(false);
  const [confirm, setConfirm] = useState<HabitView | null>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const newButton = useRef<HTMLButtonElement>(null),
    returnFocus = useRef(false);
  useEffect(() => {
    if (returnFocus.current && editing === undefined && !confirm) {
      returnFocus.current = false;
      (opener.current?.isConnected ? opener.current : newButton.current)?.focus();
    }
  }, [editing, confirm]);
  const close = () => {
    returnFocus.current = true;
    setEditing(undefined);
  };
  const normalized = search
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
  const ordered = orderedHabits(model.value?.habits ?? [], desktop.value?.preferences.habitOrder);
  const matching = ordered.filter(
    (habit) =>
      (filter === 'all' || (!habit.archived && habit.today.status === filter)) &&
      (archived || !habit.archived) &&
      habit.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .includes(normalized),
  );
  const displayed = matching.slice(0, limit);
  async function move(id: string, direction: -1 | 1) {
    if (desktop.busy || model.busy || model.blocked) return;
    const next = moveHabit(
      ordered.map((habit) => habit.id),
      displayed.map((habit) => habit.id),
      id,
      direction,
    );
    if (!next) return;
    const saved = await desktop.update({ habitOrder: next });
    setAnnouncement(
      saved ? 'Ordem dos hábitos salva.' : 'Não foi possível salvar a ordem. Tente novamente.',
    );
    grid.current?.querySelector<HTMLElement>(`[data-habit-id="${id}"]`)?.focus();
  }
  if (!model.live) return null;
  return (
    <div className="habit-route real-habits">
      <div className="example-heading habits-heading">
        <div className="habits-title-block">
          <h2>Seus hábitos</h2>
          {model.value && (
            <p className="habit-caption">
              {dateLabel(model.value.today)} · Datas no fuso de cada hábito · Consistência dos
              últimos 28 dias
            </p>
          )}
        </div>
        <button
          data-ui="primary"
          ref={newButton}
          onClick={(event) => {
            opener.current = event.currentTarget;
            setEditing(null);
          }}
          disabled={!model.value || model.busy || model.blocked}
        >
          <Plus size={16} aria-hidden="true" />
          Novo hábito
        </button>
      </div>
      {model.error && (
        <div className="focus-message" role="alert">
          {model.error}{' '}
          <button
            disabled={model.busy}
            onClick={() => {
              if (model.blocked)
                void model.retry().then((ok) => {
                  if (ok) {
                    close();
                    setConfirm(null);
                  }
                });
              else void model.refresh();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!model.value ? (
        <p>Carregando hábitos…</p>
      ) : (
        <>
          {editing !== undefined && (
            <AppDialog
              title={editing ? 'Editar hábito' : 'Novo hábito'}
              className="habit-editor-dialog"
              onCancel={close}
            >
              <HabitForm
                key={editing?.id ?? 'new'}
                habit={editing}
                today={model.value.today}
                model={model}
                close={close}
              />
            </AppDialog>
          )}
          <div className="habits-toolbar">
            <CompactSelect
              label="Exibir hábitos"
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setLimit(20);
              }}
              options={[
                { value: 'all', label: 'Todos os estados' },
                { value: 'pending', label: 'Pendentes hoje' },
                { value: 'completed', label: 'Concluídos hoje' },
              ]}
            />
            <button
              aria-pressed={organizing}
              disabled={!desktop.value || desktop.busy}
              onClick={() => setOrganizing((value) => !value)}
            >
              {organizing ? 'Concluir organização' : 'Organizar'}
            </button>
            <label className="habit-inline">
              <input
                type="checkbox"
                checked={compact}
                onChange={(event) => {
                  setCompact(event.target.checked);
                  try {
                    localStorage.setItem('krono.habits.compact', String(event.target.checked));
                  } catch {
                    /* Aparência opcional. */
                  }
                }}
              />
              Lista compacta
            </label>
            {model.value.habits.length > 6 && (
              <label className="habit-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Buscar hábitos"
                  placeholder="Buscar hábitos"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setLimit(20);
                  }}
                />
              </label>
            )}
            <label className="habit-inline">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => {
                  setArchived(event.target.checked);
                  setLimit(20);
                }}
              />
              Mostrar arquivados
            </label>
          </div>
          {desktop.error && !model.error && <p role="alert">{desktop.error}</p>}
          <p className="habit-order-status" role="status">
            {announcement}
          </p>
          {organizing && (
            <p className="habit-caption">
              Use as setas para mover os hábitos visíveis. A ordem fica salva também ao sair da
              organização.
            </p>
          )}
          {!matching.length && editing === undefined && (
            <div className="clean-empty">
              <h2>
                {normalized || filter !== 'all'
                  ? 'Nenhum hábito encontrado'
                  : 'Nenhum hábito cadastrado'}
              </h2>
              <p>
                {normalized || filter !== 'all'
                  ? 'Tente outro nome ou altere o filtro.'
                  : 'Crie um hábito de ação ou de tempo.'}
              </p>
            </div>
          )}
          {matching.length > 0 && (
            <details className="habit-legend">
              <summary>Últimos 28 dias · Ver legenda</summary>
              <div className="habit-map-legend" aria-label="Legenda dos últimos 28 dias">
                <span>Últimos 28 dias</span>
                {(
                  ['completed', 'missed', 'pending', 'rest', 'future', 'not-applicable'] as const
                ).map((status) => (
                  <span key={status}>
                    <i data-status={status} aria-hidden="true" />
                    {states[status]}
                  </span>
                ))}
              </div>
              <p className="habit-caption">
                A sequência conta ocorrências previstas concluídas. Dias de descanso não são faltas.
              </p>
            </details>
          )}
          <div className="habit-grid" data-compact={compact} ref={grid}>
            {displayed.map((habit, index) => (
              <article
                className="habit-record"
                tabIndex={-1}
                key={habit.id}
                data-habit-id={habit.id}
                data-state={habit.archived ? 'archived' : habit.today.status}
                aria-label={habit.name}
              >
                <div className="example-heading">
                  <span className="habit-identity">
                    <span className="habit-glyph" aria-hidden="true">
                      <HabitGlyph value={habit.icon} kind={habit.kind} />
                    </span>
                    <h2>{habit.name}</h2>
                  </span>
                  <span className="habit-status">
                    {habit.archived ? 'Arquivado' : states[habit.today.status]}
                  </span>
                </div>
                {organizing && (
                  <div className="habit-order-controls" aria-label={`Ordem de ${habit.name}`}>
                    <span>
                      Posição {index + 1} de {displayed.length} visíveis
                    </span>
                    <button
                      aria-label={`Mover ${habit.name} para cima`}
                      disabled={index === 0 || desktop.busy || model.busy || model.blocked}
                      onClick={() => {
                        void move(habit.id, -1);
                      }}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Mover ${habit.name} para baixo`}
                      disabled={
                        index === displayed.length - 1 ||
                        desktop.busy ||
                        model.busy ||
                        model.blocked
                      }
                      onClick={() => {
                        void move(habit.id, 1);
                      }}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <p>
                  {frequencyName(habit.frequency)} ·{' '}
                  {habit.kind === 'time'
                    ? `${Math.floor(habit.today.durationMs / 60_000)} / ${habit.targetMinutes} min`
                    : 'Ação'}
                </p>
                {habit.pendingChange && <p>Mudança de frequência/meta agendada para amanhã.</p>}
                <div className="habit-actions">
                  {!habit.archived && habit.kind === 'time' && (
                    <button
                      disabled={model.busy || model.blocked}
                      onClick={() => {
                        void model.send('select', habit.id).then((ok) => {
                          if (ok) onFocus();
                        });
                      }}
                    >
                      Preparar foco
                    </button>
                  )}
                  {!habit.archived &&
                    habit.kind === 'action' &&
                    ['pending', 'completed'].includes(habit.today.status) && (
                      <button
                        data-ui="complete"
                        aria-disabled={model.busy || model.blocked}
                        onClick={() => {
                          void model.send(
                            habit.today.status === 'completed' ? 'undo' : 'check',
                            habit.id,
                          );
                        }}
                      >
                        {habit.today.status === 'completed'
                          ? 'Desfazer conclusão'
                          : 'Concluir hoje'}
                      </button>
                    )}
                  <details className="habit-secondary-actions" open={!compact}>
                    <summary hidden={!compact}>Ações</summary>
                    <div className="history-content">
                      {!habit.archived && (
                        <button
                          disabled={model.busy || model.blocked}
                          onClick={(event) => {
                            opener.current = event.currentTarget;
                            setEditing(habit);
                          }}
                        >
                          Editar
                        </button>
                      )}
                      <button
                        disabled={model.busy || model.blocked}
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setDeleting(false);
                          setConfirmedDelete(false);
                          setConfirm(habit);
                        }}
                      >
                        {habit.archived ? 'Reativar' : 'Arquivar'}
                      </button>
                      <button
                        className="habit-delete"
                        disabled={model.busy || model.blocked}
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setDeleting(true);
                          setConfirmedDelete(false);
                          setConfirm(habit);
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </details>
                </div>
                <details className="habit-extra" open={!compact}>
                  <summary hidden={!compact}>Detalhes e histórico</summary>
                  <div className="history-content">
                    <p className="habit-consistency">
                      <span>Sequência: {habit.streak}</span>
                      <span>
                        {habit.expected
                          ? `${habit.completed} de ${habit.expected} concluídas nos últimos 28 dias (${Math.round((habit.completed / habit.expected) * 100)}%)`
                          : 'Nenhuma ocorrência prevista no período'}
                      </span>
                    </p>
                    <div className="habit-heatmap" aria-hidden="true">
                      {habit.history.map((day) => (
                        <i
                          key={day.date}
                          data-status={day.status}
                          title={`${dateLabel(day.date)} — ${states[day.status]}`}
                        />
                      ))}
                    </div>
                    <HistoryDisclosure title={`Histórico de ${habit.name}`}>
                      {() => (
                        <>
                          <p className="habit-caption">
                            Fuso horário: {timezoneLabel(habit.timezone)}. As datas seguem o
                            calendário deste hábito.
                          </p>
                          <ol className="habit-history">
                            {habit.history.map((day) => (
                              <li key={day.date} data-status={day.status}>
                                <time dateTime={day.date}>{dateLabel(day.date)}</time>
                                <span>
                                  {states[day.status]}
                                  {habit.kind === 'time' && day.durationMs > 0
                                    ? ` · ${Math.floor(day.durationMs / 60_000)} min`
                                    : ''}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </>
                      )}
                    </HistoryDisclosure>
                  </div>
                </details>
              </article>
            ))}
          </div>
          {matching.length > 20 && (
            <div className="habits-pagination">
              <span role="status">
                Mostrando {displayed.length} de {matching.length} hábitos
              </span>
              {displayed.length < matching.length && (
                <button onClick={() => setLimit((current) => current + 20)}>
                  Mostrar mais hábitos
                </button>
              )}
            </div>
          )}
          {confirm && (
            <AppDialog
              alert
              title={
                deleting
                  ? 'Excluir hábito permanentemente'
                  : confirm.archived
                    ? 'Reativar hábito'
                    : 'Arquivar hábito'
              }
              onCancel={() => {
                if (!model.busy) {
                  returnFocus.current = true;
                  setConfirm(null);
                }
              }}
            >
              <p>
                {deleting
                  ? `Excluir “${confirm.name}”? O hábito e suas marcações serão removidos. As sessões e o tempo de foco serão preservados, sem vínculo com este hábito. Esta ação não pode ser desfeita.`
                  : confirm.archived
                    ? 'Reativar a partir de hoje? O período arquivado permanece preservado.'
                    : 'Arquivar a partir de hoje? O histórico anterior e as sessões serão preservados.'}
              </p>
              {deleting && (
                <>
                  <p>
                    Se houver uma sessão vinculada, encerre-a no Foco. Se ela já terminou, selecione
                    Foco ou uma pausa antes de excluir.
                  </p>
                  <label className="habit-inline">
                    <input
                      type="checkbox"
                      checked={confirmedDelete}
                      disabled={model.busy}
                      onChange={(event) => setConfirmedDelete(event.target.checked)}
                    />
                    Entendo que a exclusão é permanente
                  </label>
                </>
              )}
              {model.error && <p role="alert">{model.error}</p>}
              <div className="dialog-actions">
                <button
                  data-dialog-cancel
                  autoFocus
                  disabled={model.busy}
                  onClick={() => {
                    returnFocus.current = true;
                    setConfirm(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  data-primary="true"
                  disabled={model.busy || model.blocked || (deleting && !confirmedDelete)}
                  onClick={() => {
                    void model
                      .send(
                        deleting ? 'delete' : confirm.archived ? 'restore' : 'archive',
                        confirm.id,
                        deleting ? { confirmPermanent: confirmedDelete } : {},
                      )
                      .then((ok) => {
                        if (ok) {
                          returnFocus.current = true;
                          setConfirm(null);
                        }
                      });
                  }}
                >
                  {deleting ? 'Excluir permanentemente' : 'Confirmar'}
                </button>
              </div>
            </AppDialog>
          )}
        </>
      )}
    </div>
  );
}

export function HabitContext({ model }: { model: HabitsModel }) {
  const [nextFocus, setNextFocus] = useState(false);
  if (!model.live) return <strong>Nenhum vínculo</strong>;
  return (
    <span className="habit-context">
      <CompactSelect
        label="Hábito para o próximo Foco"
        disabled={!model.value}
        busy={model.busy || model.blocked}
        value={model.value?.selectedId ?? ''}
        onChange={(value) => {
          void model.send('select', value || null).then(async (ok) => {
            if (ok) {
              try {
                const timer = await window.krono?.timer?.read();
                setNextFocus(
                  !!timer?.sessionId && ['running', 'paused', 'recovering'].includes(timer.state),
                );
              } catch {
                setNextFocus(true);
              }
            }
          });
        }}
        options={[
          { value: '', label: 'Sem vínculo' },
          ...(model.value?.habits
            .filter((habit) => habit.kind === 'time' && !habit.archived)
            .map((habit) => ({ value: habit.id, label: habit.name })) ?? []),
        ]}
      />
      {nextFocus && <small role="status">Vale para o próximo foco</small>}
    </span>
  );
}
import { timezoneLabel } from '../../design/timezoneLabel';
