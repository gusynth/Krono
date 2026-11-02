import { useRef, useState } from 'react';
import { ArrowRight, Pencil } from 'lucide-react';
import { avatarIds, type LocalProfile } from '../../../shared/contracts/profile';
import type { HabitsModel } from '../habits/useHabits';
import { useProduction } from '../production/useProduction';
import { durationLabel } from '../production/format';
import { useLocalProfile } from './useLocalProfile';
import { DailyReview } from './DailyReview';
import { AppDialog } from '../../design/AppDialog';
const names = {
  gato: 'Gato',
  cachorro: 'Cachorro',
  tigre: 'Tigre',
  raposa: 'Raposa',
  coruja: 'Coruja',
  coelho: 'Coelho',
  brasa: 'Brasa',
  musgo: 'Musgo',
  nimbo: 'Nimbo',
  amora: 'Amora',
  lumi: 'Lumi',
  mare: 'Maré',
};
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase('pt-BR') || 'K';
export function Avatar({ profile }: { profile: LocalProfile }) {
  return (
    <span className="profile-avatar" aria-hidden="true">
      {profile.avatar ? (
        <img src={`./avatars/${profile.avatar}.png`} width="112" height="112" alt="" />
      ) : (
        <span>{initials(profile.name)}</span>
      )}
    </span>
  );
}
export function ProfileForm({
  initial,
  busy,
  save,
  skip,
  cancel,
}: {
  initial: LocalProfile;
  busy: boolean;
  save: (value: LocalProfile) => Promise<void>;
  skip?: () => void;
  cancel?: () => void;
}) {
  const [name, setName] = useState(initial.name),
    [avatar, setAvatar] = useState(initial.avatar);
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save({ name: name.trim(), avatar, onboarded: true });
      }}
    >
      <label>
        Como você quer ser chamado?
        <input
          autoFocus
          name="profile-name"
          autoComplete="off"
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Seu nome"
        />
      </label>
      <fieldset>
        <legend>Escolha seu avatar</legend>
        <div className="avatar-options">
          {avatarIds.map((id) => (
            <button
              type="button"
              key={id}
              aria-label={`Avatar ${names[id]}`}
              aria-pressed={avatar === id}
              onClick={() => setAvatar(id)}
              disabled={busy}
            >
              <img src={`./avatars/${id}.png`} width="72" height="72" alt="" />
              <span>{names[id]}</span>
            </button>
          ))}
          <button
            type="button"
            className="initials-option"
            aria-label={`Usar iniciais ${initials(name)}`}
            aria-pressed={avatar === null}
            onClick={() => setAvatar(null)}
            disabled={busy}
          >
            <span className="initials-preview">{initials(name)}</span>
            <span>Iniciais</span>
          </button>
        </div>
      </fieldset>
      <div className="profile-form-footer">
        <div className="dialog-actions">
          {cancel && (
            <button type="button" disabled={busy} onClick={cancel}>
              Cancelar
            </button>
          )}
          {skip && (
            <button type="button" disabled={busy} onClick={skip}>
              Agora não
            </button>
          )}
          <button data-primary="true" type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar perfil'}
          </button>
        </div>
      </div>
    </form>
  );
}
export function Profile({
  active,
  habits,
  onFocus,
  onHabits,
  garden,
}: {
  garden?: import('react').ReactNode;
  active: boolean;
  habits: HabitsModel;
  onFocus: () => void;
  onHabits?: () => void;
}) {
  const model = useLocalProfile(),
    production = useProduction(active, 7);
  const [editing, setEditing] = useState(false),
    edit = useRef<HTMLButtonElement>(null);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setEditing(false);
  }
  const value = model.value;
  const close = () => {
    setEditing(false);
    edit.current?.focus();
  };
  return (
    <div className="profile-route">
      {model.error && (
        <p className="focus-message" role="alert">
          {model.error}
        </p>
      )}
      {!value ? (
        <p role="status">Carregando perfil…</p>
      ) : !value.onboarded ? (
        <div className="profile-welcome">
          <span className="eyebrow">PRIMEIRO ACESSO</span>
          <h2>Seu perfil no Krono</h2>
          <p>
            Escolha um nome e um avatar. Tudo fica neste dispositivo e pode ser alterado depois.
          </p>
          <ProfileForm
            initial={value}
            busy={model.busy}
            save={async (next) => {
              await model.save(next);
            }}
            skip={() => {
              void model.save({ ...value, onboarded: true });
            }}
          />
        </div>
      ) : (
        <>
          <div className="profile-identity">
            <Avatar profile={value} />
            <div>
              <span className="eyebrow">SEU ESPAÇO</span>
              <h2>{value.name || 'Seu perfil'}</h2>
              <button ref={edit} className="profile-edit" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden="true" />
                Editar perfil
              </button>
            </div>
            <button className="profile-open-focus" onClick={onFocus}>
              Abrir temporizador
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
          {(production.value?.today || habits.value?.today) && (
            <DailyReview
              active={active}
              today={(production.value?.today || habits.value?.today)!}
              habits={habits}
              onHabits={onHabits}
            />
          )}
          {garden}
          <section className="profile-week" aria-labelledby="profile-week-title">
            <div>
              <h2 id="profile-week-title">Últimos 7 dias</h2>
              <span>
                {production.value && !production.error
                  ? `${durationLabel(production.value.metrics.eligibleMs)} de foco concluído`
                  : 'Resumo de Foco'}
              </span>
            </div>
            {production.value &&
              !production.error &&
              production.value.previous.percentChange !== null && (
                <p className="chart-scale">
                  {production.value.previous.percentChange === null
                    ? 'Comparação disponível quando houver registros no período anterior.'
                    : `${production.value.previous.percentChange >= 0 ? '+' : ''}${production.value.previous.percentChange.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% nos dias encerrados, em relação ao período anterior.`}
                </p>
              )}
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
            ) : !production.value ? (
              <p>
                {window.krono?.production
                  ? 'Carregando resumo…'
                  : 'Prévia demonstrativa · sem registros locais.'}
              </p>
            ) : !production.value.metrics.eligibleMs ? (
              <div className="profile-empty">
                <strong>Seu histórico começa com o primeiro foco</strong>
                <p>
                  Use Abrir temporizador para iniciar. As sessões concluídas aparecem aqui,
                  distribuídas por dia.
                </p>
              </div>
            ) : (
              <>
                <p className="chart-scale">Altura relativa ao dia com mais foco neste período.</p>
                <ol className="profile-days">
                  {production.value.daysData.map((day) => (
                    <li key={day.date}>
                      <span className="profile-day-track" aria-hidden="true">
                        <i
                          style={{
                            height: `${day.durationMs ? Math.max(6, (day.durationMs / Math.max(1, ...production.value!.daysData.map((item) => item.durationMs))) * 100) : 0}%`,
                          }}
                        />
                      </span>
                      <time dateTime={day.date}>
                        {day.date.slice(8)}/{day.date.slice(5, 7)}
                      </time>
                      <span>{durationLabel(day.durationMs)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
          {editing && (
            <AppDialog title="Editar perfil" onCancel={close}>
              <ProfileForm
                initial={value}
                busy={model.busy}
                cancel={close}
                save={async (next) => {
                  if (await model.save(next)) close();
                }}
              />
              {model.error && <p role="alert">{model.error}</p>}
            </AppDialog>
          )}
        </>
      )}
    </div>
  );
}
