import { useLayoutEffect, useRef } from 'react';
import { NavigationObject } from './icons/NavigationObject';
import type { Theme } from '../design/themes';
import { AsciiObject } from './icons/AsciiObject';
import type { NavigationObject as Destination } from './icons/animation';
export type StudyDestination = Destination;

const destinations = [
  { id: 'profile', name: 'Perfil' },
  { id: 'focus', name: 'Foco' },
  { id: 'habits', name: 'Hábitos' },
  { id: 'production', name: 'Produção' },
] as const;
// Resposta criticamente amortecida, normalizada para terminar em 260 ms sem overshoot.
const settle = (time: number) =>
  (1 - (1 + 9 * time) * Math.exp(-9 * time)) / (1 - 10 * Math.exp(-9));

interface Props {
  destination: StudyDestination;
  activation: { target: string; sequence: number };
  reduce: boolean;
  reducedEffects: boolean;
  visible: boolean;
  onNavigate: (destination: StudyDestination) => void;
  theme?: Theme;
  vertical?: boolean;
}

export function StudyNavigation({
  destination,
  activation,
  reduce,
  reducedEffects,
  visible,
  onNavigate,
  theme = 'original',
  vertical = false,
}: Props) {
  const nav = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLElement>(null);
  const animation = useRef<Animation | null>(null);
  const placed = useRef(false);
  const animationStart = useRef(0);

  useLayoutEffect(() => {
    const root = nav.current!;
    const line = indicator.current!;
    const align = (animate: boolean, continuation = false) => {
      const item = root.querySelector<HTMLButtonElement>('[aria-current="page"]')!;
      const parent = root.getBoundingClientRect();
      const button = item.getBoundingClientRect();
      const current = line.getBoundingClientRect();
      const from = current.left - parent.left - root.clientLeft;
      const fromY = current.top - parent.top - root.clientTop;
      const to = button.left - parent.left - root.clientLeft;
      const toY =
        theme === 'original'
          ? button.top - parent.top - root.clientTop
          : vertical
            ? button.bottom - parent.top - root.clientTop - 3
            : parent.height - 15;
      const width = button.width;
      const height = theme === 'original' ? button.height : 3;
      const now = performance.now();
      if (!continuation) animationStart.current = now;
      const progress = continuation ? Math.min(1, (now - animationStart.current) / 260) : 0;
      const remaining = 260 * (1 - progress),
        initialEase = settle(progress);
      animation.current?.cancel();
      line.style.transform = `translate(${to}px,${toY}px)`;
      line.style.width = `${width}px`;
      line.style.height = `${height}px`;
      if (
        animate &&
        placed.current &&
        remaining > 1 &&
        (Math.abs(from - to) > 0.1 ||
          Math.abs(fromY - toY) > 0.1 ||
          Math.abs(current.width - width) > 0.1 ||
          Math.abs(current.height - height) > 0.1)
      ) {
        animation.current = line.animate(
          Array.from({ length: 25 }, (_, index) => {
            const time = index / 24;
            const amount =
              (settle(progress + time * (1 - progress)) - initialEase) / (1 - initialEase);
            return {
              transform: `translate(${from + (to - from) * amount}px,${fromY + (toY - fromY) * amount}px)`,
              width: `${current.width + (width - current.width) * amount}px`,
              height: `${current.height + (height - current.height) * amount}px`,
              offset: time,
            };
          }),
          { duration: remaining, easing: 'linear', iterations: 1 },
        );
        animation.current.id = 'selection-slide';
      }
      placed.current = true;
    };
    align(!reduce);
    const geometry = () =>
      [
        root.clientWidth,
        ...Array.from(
          root.querySelectorAll('button'),
          (button) =>
            `${button.offsetLeft}:${button.offsetTop}:${button.offsetWidth}:${button.offsetHeight}`,
        ),
      ].join('|');
    let previous = geometry();
    const observer = new ResizeObserver(() => {
      const next = geometry();
      if (next !== previous) {
        previous = next;
        align(!reduce && animation.current?.playState === 'running', true);
      }
    });
    observer.observe(root);
    root.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [destination, reduce, vertical, theme]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);

  return (
    <nav id="primary-navigation" ref={nav} className="clean-nav" aria-label="Navegação principal">
      {destinations.map(({ id, name }) => (
        <button
          key={id}
          aria-label={name}
          onClick={() => onNavigate(id)}
          aria-current={destination === id ? 'page' : undefined}
        >
          <span className="nav-content">
            {theme === 'terminal' ? (
              <AsciiObject
                kind={id}
                activation={activation.target === id ? activation.sequence : 0}
                reduce={reduce || !visible}
              />
            ) : (
              <NavigationObject
                engraved={theme === 'original'}
                kind={id}
                activation={activation.target === id ? activation.sequence : 0}
                reduceMotion={reduce}
                reduceEffects={reducedEffects}
                visible={visible}
              />
            )}
            <span>{name}</span>
          </span>
          <span className="nav-hint" aria-hidden="true">
            {name}
          </span>
        </button>
      ))}
      <i ref={indicator} className="clean-selection" aria-hidden="true" />
    </nav>
  );
}
