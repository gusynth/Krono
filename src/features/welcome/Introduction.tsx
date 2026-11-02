import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AppDialog } from '../../design/AppDialog';
import { interfaceMotion } from '../../design/motion';
import { Avatar, ProfileForm } from '../profile/Profile';
import { useLocalProfile } from '../profile/useLocalProfile';
import { GlobalShortcutSettings } from '../settings/GlobalShortcutSettings';
import { useIntroduction } from './useIntroduction';
import mark from '../../../assets/desktop/brand/cronus-256.png';
import { AmbientBackground } from '../../design/AmbientBackground';

const titles = [
  'Bem-vindo ao Krono',
  'Um tempo para cada etapa',
  'Seu ritmo, registrado',
  'O Krono por perto',
  'Seu espaço',
];
export function Introduction({
  request,
  reduce,
  ready,
  visible,
  ambient,
  onOpenChange,
}: {
  request: number;
  reduce: boolean;
  ready: boolean;
  visible: boolean;
  ambient: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const model = useIntroduction(),
    profile = useLocalProfile();
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0);
  const [gardenChoice, setGardenChoice] = useState<boolean | null>(null);
  const completed = model.value?.preferences.introduction?.completed === true;
  const automatic = useRef(false),
    seenRequest = useRef(0),
    body = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const animatedStep = useRef<number | null>(null);
  useLayoutEffect(() => onOpenChange(open), [open, onOpenChange]);
  useEffect(() => {
    if (!ready || !model.value || automatic.current) return;
    let alive = true;
    void window.krono?.timer
      ?.read()
      .then((timer) => {
        if (!alive) return;
        automatic.current = true;
        const prefs = model.value!.preferences;
        const eligible = prefs.introduction
          ? !prefs.introduction.completed
          : !prefs.profile?.onboarded && !prefs.firstHideSeen;
        if (!timer.sessionId && eligible) {
          setStep(prefs.introduction?.step ?? 0);
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, model.value]);
  useEffect(() => {
    if (request > seenRequest.current) {
      seenRequest.current = request;
      automatic.current = true;
      setStep(0);
      setOpen(true);
    }
  }, [request]);
  useEffect(() => {
    let alive = true;
    const off = window.krono?.desktop?.onFocus(() => {
      if (completed) {
        setOpen(false);
        return;
      }
      void window.krono?.timer
        ?.read()
        .then((timer) => {
          if (alive && timer.sessionId) setOpen(false);
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [completed]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step]);
  useLayoutEffect(() => {
    if (!open) {
      animatedStep.current = null;
      return;
    }
    if (animatedStep.current === step) return;
    animatedStep.current = step;
    if (reduce || !visible || !body.current) return;
    const animation = body.current.animate(interfaceMotion.enter.frames, {
      duration: interfaceMotion.enter.duration,
      easing: interfaceMotion.easing,
    });
    animation.id = 'introduction-step';
    return () => animation.cancel();
  }, [open, step, reduce, visible]);
  if (!open) return null;
  async function advance(next: number) {
    if (await model.save(next, model.value?.preferences.introduction?.completed ?? false))
      setStep(next);
  }
  async function finish() {
    if (gardenChoice === null) return;
    if (await model.save(step, true, gardenChoice)) setOpen(false);
  }
  const profilePending = step === 4 && profile.value && !profile.value.onboarded;
  return (
    <AppDialog
      title="Conheça o Krono"
      className="introduction-dialog"
      onCancel={() => {
        if (completed) setOpen(false);
      }}
    >
      <div className="introduction-ambient-clip" aria-hidden="true">
        <AmbientBackground
          enabled={ambient}
          reduce={reduce}
          visible={visible}
          className="introduction-ambient"
        />
      </div>
      <div className={`introduction-body introduction-step-${step}`} ref={body}>
        {step === 0 && (
          <div className="introduction-emblem">
            <img src={mark} width="160" height="160" alt="" />
          </div>
        )}
        <div className="introduction-copy">
          <span className="eyebrow">
            {step === 0 ? 'FOCO · HÁBITOS · PRODUÇÃO' : `CONHEÇA O KRONO · ${step + 1} DE 5`}
          </span>
          <h2 tabIndex={-1} ref={heading}>
            {titles[step]}
          </h2>
          <p>
            {
              [
                'Um lugar para organizar suas sessões e acompanhar seus hábitos. Local, privado e disponível offline.',
                'Configure seu foco e suas pausas. O próximo passo começa quando você confirmar.',
                'Conclua hábitos e acompanhe o tempo das sessões finalizadas, com histórico e metas.',
                'Use um atalho para trazer a janela à frente. Para acompanhar a sessão em menos espaço, experimente o mini timer.',
                'Nome e avatar são opcionais. Você pode alterá-los depois em Perfil.',
              ][step]
            }
          </p>
        </div>
        {step === 1 && (
          <div className="introduction-screens">
            {[
              [
                'focus',
                'Foco',
                'Inicie, pause e retome sua sessão.',
                'Tela de Foco do Krono, com temporizador e controles completos',
              ],
              [
                'pomodoro',
                'Pausas e Pomodoro',
                'Ajuste os tempos e a frequência das pausas.',
                'Configuração completa do Pomodoro no Krono',
              ],
            ].map(([file, title, description, alt]) => (
              <figure className="introduction-screen" key={file}>
                <img src={`./welcome/${file}.png`} width="760" height="450" alt={alt} />
                <figcaption>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="introduction-screens">
            {[
              ['habits', 'Hábitos', 'Crie hábitos de ação ou tempo.'],
              ['production', 'Produção', 'Consulte os registros e defina metas.'],
            ].map(([file, title, description]) => (
              <figure className="introduction-screen" key={file}>
                <img
                  src={`./welcome/${file}.png`}
                  width="560"
                  height="350"
                  alt={`Tela de ${title} do Krono com dados de demonstração`}
                />
                <figcaption>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {(step === 1 || step === 2) && (
          <p className="introduction-example-note">Capturas do Krono com dados de demonstração.</p>
        )}
        {step === 3 && (
          <div className="introduction-access">
            <GlobalShortcutSettings />
            <div className="introduction-mini-tip">
              <span aria-hidden="true">25:00</span>
              <p>Mini timer</p>
              <small>Ctrl + Shift + M, dentro do Krono.</small>
            </div>
          </div>
        )}
        {step === 4 &&
          profile.value &&
          (profilePending ? (
            <ProfileForm
              initial={profile.value}
              busy={profile.busy || model.busy}
              save={async (next) => {
                await profile.save(next);
              }}
              skip={() => {
                void (async () => {
                  await profile.save({ ...profile.value!, onboarded: true });
                })();
              }}
            />
          ) : (
            <div className="introduction-profile">
              <Avatar profile={profile.value} />
              <span>
                <Check size={18} aria-hidden="true" />
                {profile.value.name || 'Seu perfil está pronto'}
              </span>
            </div>
          ))}
        {step === 4 && (
          <fieldset className="garden-choice">
            <legend>Quer usar o jardim de foco?</legend>
            <p>
              Um pequeno mundo que cresce com as sessões concluídas. Está em beta, com quatro
              capítulos. Você pode mudar essa escolha nos Ajustes.
            </p>
            <div>
              {[
                {
                  value: true,
                  title: 'Quero experimentar',
                  detail: 'Mostrar o jardim no meu Perfil.',
                },
                {
                  value: false,
                  title: 'Prefiro sem jardim',
                  detail: 'Manter apenas o foco e os hábitos.',
                },
              ].map((option) => (
                <label key={String(option.value)} data-selected={gardenChoice === option.value}>
                  <input
                    type="radio"
                    name="garden-choice"
                    checked={gardenChoice === option.value}
                    onChange={() => setGardenChoice(option.value)}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.detail}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {(model.error || profile.error) && (
          <p role="alert" className="focus-message">
            {model.error ?? profile.error}
          </p>
        )}
      </div>
      <footer className="introduction-footer">
        <div>
          <button
            aria-label="Etapa anterior"
            disabled={step === 0 || model.busy || profile.busy}
            onClick={() => {
              void advance(step - 1);
            }}
          >
            <ArrowLeft size={17} />
          </button>
          <ol aria-label="Etapas da apresentação">
            {titles.map((title, index) => (
              <li
                key={title}
                aria-current={index === step ? 'step' : undefined}
                aria-label={`${index + 1}: ${title}`}
                data-completed={index < step}
              />
            ))}
          </ol>
        </div>
        <div>
          {completed && (
            <button disabled={model.busy || profile.busy} onClick={() => setOpen(false)}>
              Voltar ao Krono
            </button>
          )}
          {!profilePending && (
            <button
              data-primary="true"
              disabled={model.busy || profile.busy || (step === 4 && gardenChoice === null)}
              onClick={() => {
                void (step === 4 ? finish() : advance(step + 1));
              }}
            >
              {model.busy
                ? 'Salvando…'
                : step === 4
                  ? 'Começar a usar'
                  : step === 0
                    ? 'Conhecer o Krono'
                    : 'Continuar'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>
    </AppDialog>
  );
}
