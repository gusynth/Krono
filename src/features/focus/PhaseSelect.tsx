import { useLayoutEffect, useRef } from 'react';

export function PhaseSelect({
  rest,
  long,
  disabled,
  busy,
  reduce,
  select,
}: {
  rest: boolean;
  long: boolean;
  disabled: boolean;
  busy: boolean;
  reduce: boolean;
  select: (rest: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    indicator = useRef<HTMLSpanElement>(null),
    animation = useRef<Animation | null>(null),
    placed = useRef(false);
  useLayoutEffect(() => {
    const element = root.current!,
      line = indicator.current!;
    function align(animate: boolean) {
      const target = element.querySelector<HTMLElement>('[aria-pressed=true]')!,
        current = line.getBoundingClientRect(),
        parent = element.getBoundingClientRect(),
        button = target.getBoundingClientRect();
      const from = current.left - parent.left - element.clientLeft,
        to = button.left - parent.left - element.clientLeft;
      animation.current?.cancel();
      line.style.transform = `translateX(${to}px)`;
      line.style.width = `${button.width}px`;
      if (animate && placed.current && Math.abs(from - to) > 0.1) {
        animation.current = line.animate(
          [
            { transform: `translateX(${from}px)`, width: `${current.width}px` },
            { transform: `translateX(${to}px)`, width: `${button.width}px` },
          ],
          { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
        animation.current.id = 'phase-slide';
      }
      placed.current = true;
    }
    align(!reduce);
    const geometry = () =>
      Array.from(
        element.querySelectorAll('button'),
        (button) => `${button.offsetLeft}:${button.offsetWidth}`,
      ).join('|');
    let previous = geometry();
    const observer = new ResizeObserver(() => {
      const next = geometry();
      if (next !== previous) {
        previous = next;
        align(false);
      }
    });
    observer.observe(element);
    element.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [rest, long, reduce]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return (
    <div ref={root} className="clean-modes" aria-label="Fase">
      <span ref={indicator} className="phase-selection" aria-hidden="true" />
      <button
        disabled={disabled}
        aria-disabled={busy}
        aria-pressed={!rest}
        onClick={() => select(false)}
      >
        Foco
      </button>
      <button
        disabled={disabled}
        aria-disabled={busy}
        aria-pressed={rest}
        onClick={() => select(true)}
      >
        {long ? 'Pausa longa' : 'Pausa curta'}
      </button>
    </div>
  );
}
