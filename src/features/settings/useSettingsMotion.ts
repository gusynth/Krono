import { useLayoutEffect, useRef } from 'react';
import { interfaceMotion, settingsMotion } from '../../design/motion';

/** Only decorates category changes; pages stay mounted and commands stay immediate. */
export function useSettingsMotion(open: boolean, section: string, reduced: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(section);
  const interrupted = useRef<Keyframe>({ opacity: 1, transform: 'translateX(0)' });
  useLayoutEffect(() => {
    const element = root.current;
    if (!open || !element) return;
    const nav = element.querySelector<HTMLElement>('.settings-sections')!;
    const indicator = nav.querySelector<HTMLElement>('.settings-selection')!;
    const pages = [...element.querySelectorAll<HTMLElement>('[data-settings-page]')];
    const old = pages.find((page) => page.id === previous.current);
    const current = pages.find((page) => page.id === section)!;
    const changed = previous.current !== section;
    const direction = pages.indexOf(current) >= pages.indexOf(old!) ? 1 : -1;
    previous.current = section;
    const animations: Animation[] = [];
    const canAnimate = () => !reduced && !document.hidden;
    const play = (target: HTMLElement, frames: Keyframe[], duration: number, id: string) => {
      const animation = target.animate(frames, { duration, easing: interfaceMotion.easing });
      animation.id = id;
      animations.push(animation);
      return animation;
    };
    const settlePages = () => {
      pages.forEach((page) => {
        page.hidden = page !== current;
        page.inert = page !== current;
        page.classList.remove('settings-page-outgoing');
      });
    };
    const align = (animate: boolean) => {
      const button = nav.querySelector<HTMLElement>('[aria-pressed=true]')!;
      const before = indicator.getBoundingClientRect(),
        parent = nav.getBoundingClientRect(),
        target = button.getBoundingClientRect();
      const x = target.left - parent.left - nav.clientLeft,
        y = target.top - parent.top - nav.clientTop;
      const from = {
        transform: `translate(${before.left - parent.left - nav.clientLeft}px,${before.top - parent.top - nav.clientTop}px)`,
        width: `${before.width}px`,
        height: `${before.height}px`,
      };
      animations
        .filter((animation) => animation.id === 'settings-selection')
        .forEach((animation) => animation.cancel());
      Object.assign(indicator.style, {
        transform: `translate(${x}px,${y}px)`,
        width: `${target.width}px`,
        height: `${target.height}px`,
      });
      if (animate && canAnimate())
        play(
          indicator,
          [
            from,
            {
              transform: indicator.style.transform,
              width: indicator.style.width,
              height: indicator.style.height,
            },
          ],
          settingsMotion.selection,
          'settings-selection',
        );
    };
    settlePages();
    align(changed);
    if (changed && canAnimate()) {
      if (old && old !== current) {
        old.hidden = false;
        old.inert = true;
        old.classList.add('settings-page-outgoing');
        const exit = play(
          old,
          [
            interrupted.current,
            { opacity: 0, transform: `translateX(${-direction * settingsMotion.distance}px)` },
          ],
          settingsMotion.exit,
          'settings-content-exit',
        );
        exit.onfinish = () => {
          old.hidden = true;
          old.classList.remove('settings-page-outgoing');
        };
      }
      play(
        current,
        [
          { opacity: 0, transform: `translateX(${direction * settingsMotion.distance}px)` },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        settingsMotion.enter,
        'settings-content-enter',
      );
    }
    const stop = () => {
      animations.forEach((animation) => animation.cancel());
      settlePages();
      align(false);
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    const geometry = () =>
      [...nav.querySelectorAll('button')]
        .map(
          (button) =>
            `${button.offsetLeft}:${button.offsetTop}:${button.offsetWidth}:${button.offsetHeight}`,
        )
        .join('|');
    let bounds = geometry();
    const observer = new ResizeObserver(() => {
      const next = geometry();
      if (next !== bounds) {
        bounds = next;
        align(false);
      }
    });
    observer.observe(nav);
    nav.querySelectorAll('button').forEach((button) => observer.observe(button));
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      const style = getComputedStyle(current);
      interrupted.current = { opacity: style.opacity, transform: style.transform };
      const selection = getComputedStyle(indicator);
      Object.assign(indicator.style, {
        transform: selection.transform,
        width: selection.width,
        height: selection.height,
      });
      animations.forEach((animation) => animation.cancel());
      settlePages();
    };
  }, [open, section, reduced]);
  return root;
}
