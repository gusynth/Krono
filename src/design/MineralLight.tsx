import { useLayoutEffect, useRef } from 'react';

/** Camadas fixas: anima somente intensidade, sem ruído, blur ou paint por quadro. */
export function MineralLight({
  destination,
  reduced,
  visible,
  ambient = false,
}: {
  destination: string;
  reduced: boolean;
  visible: boolean;
  ambient?: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLDivElement>(null);
  const previous = useRef(destination);
  useLayoutEffect(() => {
    const changed = previous.current !== destination;
    previous.current = destination;
    const element = layer.current,
      other = second.current;
    if (!element || !other) return;
    const contrast = matchMedia('(forced-colors: active)');
    const animations: Animation[] = [];
    const stop = () => {
      animations.forEach((animation) => animation.cancel());
      element.style.willChange = other.style.willChange = 'auto';
    };
    if (!reduced && visible && !document.hidden && !contrast.matches) {
      if (ambient) {
        for (const [target, values] of [
          [element, [0.72, 1, 0.72]],
          [other, [0.65, 0.2, 0.65]],
        ] as const) {
          target.style.willChange = 'opacity';
          const animation = target.animate(
            values.map((opacity) => ({ opacity })),
            { duration: 56000, iterations: Infinity, easing: 'ease-in-out' },
          );
          animation.id = 'mineral-light-ambient';
          animations.push(animation);
        }
      } else if (changed) {
        element.style.willChange = 'opacity';
        const animation = element.animate([{ opacity: 0.72 }, { opacity: 1 }], {
          duration: 500,
          iterations: 1,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
        animation.id = 'mineral-light-arrival';
        animation.onfinish = () => {
          animation.onfinish = null;
          stop();
        };
        animations.push(animation);
      }
    }
    const visibility = () => {
      if (document.hidden) stop();
    };
    const contrastChanged = () => {
      if (contrast.matches) stop();
    };
    contrast.addEventListener('change', contrastChanged);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      animations.forEach((animation) => {
        animation.onfinish = null;
      });
      stop();
      contrast.removeEventListener('change', contrastChanged);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [destination, reduced, visible, ambient]);
  return (
    <>
      <div ref={layer} className="mineral-light" aria-hidden="true" />
      <div ref={second} className="mineral-light mineral-light-secondary" aria-hidden="true" />
    </>
  );
}
