import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GardenChapter } from '../../../shared/domain/garden';
import { paintGarden } from './scene';
const contrastQuery = () => matchMedia('(forced-colors: active)');
function observeContrast(listener: () => void) {
  const query = contrastQuery();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function GardenCanvas({
  chapter,
  stage,
  working,
  animate,
}: {
  chapter: GardenChapter['id'];
  stage: number;
  working: boolean;
  animate: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    elapsed = useRef({ sky: 0, work: 0 });
  const contrast = useSyncExternalStore(
    observeContrast,
    () => contrastQuery().matches,
    () => true,
  );
  useEffect(() => {
    const element = canvas.current!,
      context = element.getContext('2d');
    if (!context) return;
    let frame: number | null = null,
      last = performance.now(),
      painted = 0;
    const draw = () =>
      paintGarden(context, {
        chapter,
        stage,
        working,
        workTime: elapsed.current.work,
        skyTime: elapsed.current.sky,
        date: new Date(),
      });
    draw();
    const entrance =
      animate && !contrast
        ? element.animate([{ opacity: 0.35 }, { opacity: 1 }], {
            duration: 240,
            easing: 'ease-out',
          })
        : null;
    const tick = (now: number) => {
      if (document.hidden || document.documentElement.dataset.windowVisible === 'false') return;
      if (now - painted >= 1000 / 12) {
        const delta = Math.min(0.2, (now - last) / 1000);
        last = now;
        painted = now;
        elapsed.current.sky += delta;
        if (working) elapsed.current.work += delta;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    if (animate && !contrast) frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      entrance?.cancel();
    };
  }, [chapter, stage, working, animate, contrast]);
  return (
    <canvas
      ref={canvas}
      width={384}
      height={202}
      className="garden-canvas"
      role="img"
      aria-label={`Jardim em pixel art: ${chapter === 'garden' ? 'canteiros e árvores' : chapter === 'courtyard' ? 'pátio e fonte' : chapter === 'library' ? 'biblioteca e pergaminhos' : 'observatório e instrumentos celestes'}. ${working ? 'O personagem cuida do lugar durante o foco.' : 'O personagem está descansando.'}`}
    />
  );
}
