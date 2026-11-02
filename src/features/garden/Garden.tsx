import { lazy, Suspense, useState } from 'react';
import { Sprout, X } from 'lucide-react';
import { gardenChapters, gardenProgress } from '../../../shared/domain/garden';
import { AppDialog } from '../../design/AppDialog';
import { usePageVisibility } from '../../study/usePageVisibility';
import { useDesktop } from '../settings/useDesktop';
import { durationLabel } from '../production/format';
import { useGarden } from './useGarden';
import './garden.css';
const GardenCanvas = lazy(() =>
  import('./GardenCanvas').then((module) => ({ default: module.GardenCanvas })),
);
export function Garden({ available, reduce }: { available: boolean; reduce: boolean }) {
  const desktop = useDesktop(),
    visible = usePageVisibility();
  const [open, setOpen] = useState(false),
    [help, setHelp] = useState(false),
    [visited, setVisited] = useState<string | null>(null),
    [paused, setPaused] = useState(false);
  const [wasAvailable, setWasAvailable] = useState(available);
  if (wasAvailable !== available) {
    setWasAvailable(available);
    if (!available) setOpen(false);
  }
  const introduced = desktop.value?.preferences.garden?.introductionSeen === true;
  const introduction = help || !introduced;
  const model = useGarden(open && !introduction && available && visible);
  const progress = model.value ? gardenProgress(model.value.eligibleMs) : null;
  const chapter = progress?.unlocked.find((chapter) => chapter.id === visited) ?? progress?.chapter;
  const stage = progress && chapter ? (chapter.id === progress.chapter.id ? progress.stage : 2) : 0;
  const close = () => {
    setOpen(false);
    setHelp(false);
  };
  const preferences = desktop.value?.preferences.garden;
  const enabled = preferences?.enabled ?? preferences?.introductionSeen ?? false;
  if (!available || !enabled || !window.krono?.production) return null;
  return (
    <section className="garden-entry" aria-label="Seu jardim de foco">
      <div className="garden-entry-copy">
        <Sprout size={24} aria-hidden="true" />
        <div>
          <h2>
            Jardim de foco <span className="garden-beta">Beta</span>
          </h2>
          <p>Suas sessões concluídas fazem este pequeno mundo crescer.</p>
        </div>
      </div>
      <button
        className="garden-launch"
        disabled={!desktop.value}
        onClick={() => {
          setHelp(false);
          setOpen(true);
        }}
      >
        <Sprout size={16} aria-hidden="true" />
        Abrir jardim
      </button>
      {open && (
        <AppDialog title="Jardim de foco" className="garden-dialog" onCancel={close}>
          <button className="garden-close" aria-label="Fechar jardim" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
          <p className="garden-beta-note">
            <span className="garden-beta">Beta</span> Em construção. A arte, as animações e a
            progressão ainda vão receber melhorias.
          </p>
          {introduction ? (
            <div className="garden-introduction">
              <h3>Um jardim para acompanhar seus focos</h3>
              <p>
                Enquanto você faz um foco, o personagem planta, rega e cuida das construções. Ao
                concluir a sessão, o tempo registrado ajuda o lugar a crescer.
              </p>
              <p>
                Cada minuto de foco concluído vale 1 XP. Os focos que você já registrou no Krono
                também entram na conta. Pausas, sessões interrompidas e tempo com o aplicativo
                fechado não rendem experiência.
              </p>
              <p>
                Você começa no jardim e abre novos lugares aos poucos. Os anteriores ficam
                disponíveis para visitar. Pode passar um tempo sem usar: nada murcha e você não
                perde o que construiu.
              </p>
              <h4>Os capítulos desta beta</h4>
              <ol className="garden-chapter-guide">
                {gardenChapters.map((chapter) => (
                  <li key={chapter.id}>
                    <div>
                      <strong>{chapter.name}</strong>
                      <span>
                        {chapter.minutes
                          ? `${durationLabel(chapter.minutes * 60_000)} acumulados`
                          : 'Disponível desde o início'}
                      </span>
                    </div>
                    <p>{chapter.description}</p>
                  </li>
                ))}
              </ol>
              <p>
                Depois de terminar o observatório, seu nível continua subindo. Por enquanto, os
                cenários terminam nesses quatro capítulos.
              </p>
              {desktop.error && <p role="alert">{desktop.error}</p>}
              <div className="dialog-actions">
                <button data-dialog-cancel onClick={close}>
                  Agora não
                </button>
                <button
                  data-primary="true"
                  disabled={desktop.busy}
                  onClick={() => {
                    if (introduced) setHelp(false);
                    else
                      void desktop
                        .update({ garden: { version: 1, introductionSeen: true, enabled: true } })
                        .then((ok) => {
                          if (ok) setHelp(false);
                        });
                  }}
                >
                  {desktop.busy ? 'Salvando…' : 'Entrar no jardim'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {model.error ? (
                <div className="garden-error" role="alert">
                  <p>{model.error}</p>
                  <button
                    onClick={() => {
                      void model.refresh();
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : !progress || !chapter ? (
                <p role="status">Abrindo seu jardim…</p>
              ) : (
                <>
                  <div className="garden-heading">
                    <h3>{chapter.name}</h3>
                    <span>
                      Nível {progress.level} · {progress.minutes.toLocaleString('pt-BR')} XP
                    </span>
                  </div>
                  <Suspense fallback={<p role="status">Preparando o cenário…</p>}>
                    <GardenCanvas
                      chapter={chapter.id}
                      stage={stage}
                      working={model.working}
                      animate={visible && !reduce && !paused}
                    />
                  </Suspense>
                  <p className="garden-work-state">
                    {model.working
                      ? 'Foco em andamento. O personagem está cuidando do lugar.'
                      : 'O jardim está em descanso. Continue quando quiser iniciar outro foco.'}
                  </p>
                  <div className="garden-chapters" role="group" aria-label="Visitar capítulos">
                    {gardenChapters.map((item) => (
                      <button
                        key={item.id}
                        disabled={!progress.unlocked.some((chapter) => chapter.id === item.id)}
                        aria-pressed={chapter.id === item.id}
                        onClick={() => setVisited(item.id)}
                      >
                        {item.name}
                        {!progress.unlocked.some((chapter) => chapter.id === item.id) && (
                          <small>{durationLabel(item.minutes * 60_000)}</small>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="garden-progress-label">
                    <span>
                      {progress.complete
                        ? 'Capítulos disponíveis concluídos'
                        : progress.chapter.id === 'observatory'
                          ? 'Restaurando o observatório'
                          : `Próximo capítulo: ${gardenChapters[progress.unlocked.length]!.name}`}
                    </span>
                    <span>
                      {progress.complete
                        ? 'O nível continua crescendo'
                        : `Faltam ${durationLabel(progress.remainingMinutes * 60_000)}`}
                    </span>
                  </div>
                  <div
                    className="garden-track"
                    role="progressbar"
                    aria-label="Restauração do capítulo atual"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress.fraction * 100)}
                  >
                    <i style={{ width: `${progress.fraction * 100}%` }} />
                  </div>
                </>
              )}
              <div className="garden-footer">
                <button onClick={() => setHelp(true)}>Como funciona</button>
                <button
                  disabled={reduce}
                  aria-pressed={paused || reduce}
                  onClick={() => setPaused((value) => !value)}
                >
                  {reduce ? 'Movimento reduzido' : paused ? 'Retomar animação' : 'Pausar animação'}
                </button>
                <button onClick={close}>Voltar ao Krono</button>
              </div>
            </>
          )}
        </AppDialog>
      )}
    </section>
  );
}
