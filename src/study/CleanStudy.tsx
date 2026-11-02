import { useBrandMotion } from '../design/useBrandMotion';
import { Production } from '../features/production/Production';
import { Profile } from '../features/profile/Profile';
import { Introduction } from '../features/welcome/Introduction';
import { ShellDialog } from '../features/settings/ShellDialog';
import { AmbientBackground } from '../design/AmbientBackground';
import { MineralLight } from '../design/MineralLight';
import { WindowTitlebar } from '../design/WindowTitlebar';
import { DailyGoalContext } from '../features/production/DailyGoalContext';
import { Habits, HabitContext } from '../features/habits/Habits';
import { useHabits } from '../features/habits/useHabits';
import { SettingsPanel } from '../features/settings/SettingsPanel';
import { MiniTimer, useMiniMode } from '../features/focus/MiniTimer';
import { useAppShortcuts } from '../design/useAppShortcuts';
import { DesktopFeedback } from '../features/focus/DesktopFeedback';
import { FocusTimer } from '../features/focus/FocusTimer';
import { useEffect, useRef, useState } from 'react';
import { useInterfaceMotion } from '../design/useInterfaceMotion';
import { MotionConfig } from 'motion/react';
import {
  Info,
  Link2,
  Target,
  ChartNoAxesCombined,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAppearancePreferences } from '../design/useAppearancePreferences';
import symbol from '../../assets/desktop/brand/cronus-256.png';
import { appVersion } from '../../shared/version';
import { useSystemReducedMotion } from '../design/useSystemReducedMotion';
import { usePageVisibility } from './usePageVisibility';
import { StudyNavigation, type StudyDestination as Destination } from './StudyNavigation';
import { HabitExample } from './HabitExample';
import type { StorageStatus } from '../app/useFoundationStatus';
import { Garden } from '../features/garden/Garden';
import { GardenInvitation } from '../features/garden/GardenInvitation';
export function CleanStudy({ storageStatus = 'web' }: { storageStatus?: StorageStatus }) {
  const habits = useHabits();
  const [destination, setDestination] = useState<Destination>(() => {
    try {
      const appearance = JSON.parse(localStorage.getItem('krono.appearance.v1') ?? 'null'),
        last = localStorage.getItem('krono.last-page');
      return appearance?.rememberPage &&
        ['profile', 'focus', 'habits', 'production'].includes(last ?? '')
        ? (last as Destination)
        : 'profile';
    } catch {
      return 'profile';
    }
  });
  const [introductionRequest, setIntroductionRequest] = useState(0);
  const [introductionActive, setIntroductionActive] = useState(false);
  const userNavigated = useRef(false);
  useEffect(() => {
    let alive = true;
    const off = window.krono?.desktop?.onFocus(() => {
      userNavigated.current = true;
      setDestination('focus');
    });
    void window.krono?.timer
      ?.read()
      .then((value) => {
        if (alive && !userNavigated.current && value.sessionId) setDestination('focus');
      })
      .catch(() => {});
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  const [activation, setActivation] = useState({ target: 'focus', sequence: 0 });
  const [timerUnavailable, setTimerUnavailable] = useState(false);
  const [rest, setRest] = useState(false);
  const [done, setDone] = useState(false);
  const appearance = useAppearancePreferences();
  const mini = useMiniMode();
  const { reducedMotion, reducedEffects } = appearance;
  const systemReduced = useSystemReducedMotion();
  const visible = usePageVisibility();
  const reduce = reducedMotion || systemReduced || !visible || mini.active;
  const brandName = useRef<HTMLSpanElement>(null);
  const toggleBrand = useBrandMotion(
    brandName,
    appearance.navCollapsed,
    reduce || appearance.navigation !== 'side',
    (navCollapsed) => appearance.update({ navCollapsed }),
  );
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible)
      surface.current
        ?.querySelectorAll<HTMLElement>('[popover]:popover-open')
        .forEach((element) => element.hidePopover());
  }, [visible]);
  useInterfaceMotion(surface, reduce);
  function navigate(id: Destination) {
    try {
      localStorage.setItem('krono.last-page', id);
    } catch {
      /* Preferência opcional. */
    }
    userNavigated.current = true;
    surface.current
      ?.querySelectorAll<HTMLElement>('[popover]:popover-open')
      .forEach((element) => element.hidePopover());
    setDestination(id);
    setActivation((previous) => ({ target: id, sequence: previous.sequence + 1 }));
  }
  useAppShortcuts({
    shortcut: appearance.shortcut,
    navigate: (index) => {
      if (!mini.active) navigate((['profile', 'focus', 'habits', 'production'] as const)[index]!);
    },
    toggleMini: () => {
      void mini.command(mini.active ? 'leave' : 'enter');
    },
  });
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>
      <div
        ref={surface}
        className="clean-study"
        data-navigation={appearance.navigation}
        data-collapsed={appearance.navCollapsed}
        data-theme={appearance.theme}
        data-mini={mini.active}
        data-runtime={window.krono?.timer ? 'desktop' : 'web'}
        data-motion={reduce ? 'reduced' : 'full'}
        data-effects={reducedEffects ? 'reduced' : 'full'}
        data-visible={visible}
        data-phase={rest ? 'rest' : 'focus'}
      >
        <AmbientBackground
          enabled={
            !introductionActive &&
            appearance.ambient &&
            !reducedEffects &&
            appearance.theme !== 'original'
          }
          reduce={reducedMotion || systemReduced || !visible || mini.active}
          visible={visible}
        />
        {mini.active && (
          <MiniTimer
            reducedMotion={reducedMotion || systemReduced || !visible}
            active={visible}
            pinned={mini.pinned}
            comfortable={mini.comfortable}
            habitNames={Object.fromEntries(habits.value?.habits.map((h) => [h.id, h.name]) ?? [])}
            command={mini.command}
          />
        )}
        <div className="full-interface" hidden={mini.active} inert={mini.active}>
          {!mini.active && <WindowTitlebar />}
          <div className="shell-layout">
            <header className="clean-header">
              <div className="shell-brand-row">
                <div className="shell-brand-content">
                  <a
                    className="clean-brand"
                    href="#profile"
                    aria-label="Krono, Perfil"
                    onClick={(event) => {
                      event.preventDefault();
                      navigate('profile');
                    }}
                  >
                    <span ref={brandName} className="brand-wordmark brand-name" aria-hidden="true">
                      Krono
                    </span>
                    <img className="brand-symbol" src={symbol} width="40" height="40" alt="" />
                  </a>
                </div>
              </div>
              <StudyNavigation
                destination={destination}
                activation={activation}
                reduce={reduce}
                reducedEffects={reducedEffects}
                visible={visible}
                onNavigate={navigate}
                theme={appearance.theme}
                vertical={appearance.navigation === 'side'}
              />
              <div className="clean-header-actions">
                {appearance.navigation === 'side' && (
                  <button
                    className="navigation-toggle"
                    aria-controls="primary-navigation"
                    aria-label={
                      appearance.navCollapsed ? 'Expandir navegação' : 'Recolher navegação'
                    }
                    aria-expanded={!appearance.navCollapsed}
                    onClick={toggleBrand}
                  >
                    {appearance.navCollapsed ? (
                      <PanelLeftOpen size={18} />
                    ) : (
                      <PanelLeftClose size={18} />
                    )}
                  </button>
                )}
                <SettingsPanel
                  appearance={appearance}
                  timerUnavailable={timerUnavailable}
                  storageStatus={storageStatus}
                  onIntroduction={() => setIntroductionRequest((value) => value + 1)}
                />
                <span>{appVersion}</span>
              </div>
            </header>
            <div className="shell-content">
              {appearance.theme === 'original' &&
                !reducedEffects &&
                !mini.active &&
                !introductionActive && (
                  <MineralLight
                    ambient={appearance.ambient}
                    destination={destination}
                    reduced={reduce}
                    visible={visible}
                  />
                )}
              <div className="clean-notice">
                <Info size={15} />
                <p>
                  {window.krono?.timer
                    ? 'Foco, Hábitos e Produção com registro local.'
                    : 'Estudo visual · Controles demonstrativos, sem registrar tempo ou hábitos.'}
                </p>
              </div>
              {storageStatus === 'error' && (
                <div className="shell-storage-error" role="alert">
                  <AlertCircle size={19} />
                  <p>
                    A base local está indisponível. Os arquivos existentes foram preservados. Use
                    Ajustes para selecionar um backup e iniciar o resgate. Se houver um resgate
                    pendente, feche e reabra para verificá-lo.
                  </p>
                </div>
              )}
              <DesktopFeedback />
              <main className="clean-main">
                <section
                  className="clean-page secondary-page"
                  hidden={destination !== 'profile'}
                  inert={destination !== 'profile'}
                  aria-hidden={destination !== 'profile'}
                  aria-labelledby="profile-title"
                >
                  <div className="clean-heading">
                    <h1 id="profile-title">Perfil</h1>
                  </div>
                  <Profile
                    active={!mini.active && destination === 'profile' && visible}
                    habits={habits}
                    onFocus={() => navigate('focus')}
                    onHabits={() => navigate('habits')}
                    garden={
                      <Garden
                        available={!mini.active && destination === 'profile'}
                        reduce={reducedMotion || systemReduced || reducedEffects}
                      />
                    }
                  />
                </section>
                <section
                  className="clean-focus clean-page"
                  hidden={destination !== 'focus'}
                  inert={destination !== 'focus'}
                  aria-hidden={destination !== 'focus'}
                  aria-labelledby="focus-title"
                >
                  <div className="clean-heading">
                    <span className="eyebrow">TEMPORIZADOR</span>
                    <h1 id="focus-title">Foco</h1>
                  </div>
                  <div className="focus-workspace">
                    <div className="focus-stage">
                      <FocusTimer
                        onMini={
                          mini.available
                            ? () => {
                                void mini.command('enter');
                              }
                            : undefined
                        }
                        active={!mini.active && destination === 'focus' && visible}
                        reduce={reduce}
                        onRest={setRest}
                        onAvailabilityError={setTimerUnavailable}
                      />
                    </div>
                    <aside className="focus-details" aria-label="Contexto da sessão">
                      <div className="clean-context" aria-label="Contexto de estudo">
                        <div>
                          <Link2 size={17} />
                          <span>
                            <small>Hábito</small>
                            <HabitContext model={habits} />
                          </span>
                        </div>
                        <div>
                          <Target size={17} />
                          <span>
                            <small>Meta diária global</small>
                            {window.krono?.production ? (
                              <button
                                className="goal-context-link"
                                aria-label="Editar meta diária global"
                                onClick={() => navigate('production')}
                              >
                                <DailyGoalContext
                                  active={!mini.active && destination === 'focus' && visible}
                                />
                              </button>
                            ) : (
                              <DailyGoalContext
                                active={!mini.active && destination === 'focus' && visible}
                              />
                            )}
                          </span>
                        </div>
                      </div>
                      {habits.live && habits.error && (
                        <div className="focus-message" role="alert">
                          {habits.error}{' '}
                          <button
                            disabled={habits.busy}
                            onClick={() => {
                              void (habits.blocked ? habits.retry() : habits.refresh());
                            }}
                          >
                            Tentar novamente
                          </button>
                        </div>
                      )}
                      {!habits.live && (
                        <div className="focus-habit">
                          <div className="example-heading">
                            <h2>Hábito de exemplo</h2>
                            <span>1 hábito</span>
                          </div>
                          <HabitExample done={done} onChange={setDone} />
                        </div>
                      )}
                    </aside>
                  </div>
                </section>
                <section
                  className="clean-page secondary-page"
                  hidden={destination !== 'habits'}
                  inert={destination !== 'habits'}
                  aria-hidden={destination !== 'habits'}
                  aria-labelledby="habits-title"
                >
                  <div className="clean-heading">
                    <span className="eyebrow">HOJE</span>
                    <h1 id="habits-title">Hábitos</h1>
                  </div>
                  {habits.live ? (
                    <Habits model={habits} onFocus={() => navigate('focus')} />
                  ) : (
                    <div className="habit-route">
                      <h2>Hábito de exemplo</h2>
                      <HabitExample done={done} onChange={setDone} />
                    </div>
                  )}
                </section>
                <section
                  className="clean-page secondary-page"
                  hidden={destination !== 'production'}
                  inert={destination !== 'production'}
                  aria-hidden={destination !== 'production'}
                  aria-labelledby="production-title"
                >
                  <div className="clean-heading">
                    <span className="eyebrow">HISTÓRICO</span>
                    <h1 id="production-title">Produção</h1>
                  </div>
                  {window.krono?.production ? (
                    <Production active={!mini.active && destination === 'production' && visible} />
                  ) : (
                    <div className="clean-empty">
                      <ChartNoAxesCombined size={36} strokeWidth={1.3} />
                      <h2>Nenhuma sessão registrada</h2>
                      <p>As métricas e o histórico ainda não estão integrados.</p>
                    </div>
                  )}
                </section>
              </main>
            </div>
          </div>
        </div>
        {mini.error && (
          <p role="alert" className="focus-message">
            {mini.error}
          </p>
        )}
        <Introduction
          request={introductionRequest}
          reduce={reduce}
          ready={storageStatus === 'ready' && !mini.active}
          visible={visible}
          ambient={appearance.ambient && !reducedEffects && appearance.theme !== 'original'}
          onOpenChange={setIntroductionActive}
        />
        <GardenInvitation
          ready={storageStatus === 'ready'}
          available={!mini.active && !introductionActive}
          visible={visible}
          onEnabled={() => navigate('profile')}
        />
        <ShellDialog />
      </div>
    </MotionConfig>
  );
}
