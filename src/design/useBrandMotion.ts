import { useLayoutEffect, useRef, type RefObject } from 'react';

/** O nome sai antes da geometria; entra somente quando o contêiner o comporta. */
export function useBrandMotion(
  name: RefObject<HTMLSpanElement | null>,
  collapsed: boolean,
  reduced: boolean,
  update: (value: boolean) => void,
) {
  const current = useRef(collapsed),
    commit = useRef(update),
    pending = useRef<boolean | null>(null);
  const animation = useRef<Animation | null>(null),
    generation = useRef(0),
    previous = useRef(collapsed);
  useLayoutEffect(() => {
    current.current = collapsed;
    commit.current = update;
  });
  useLayoutEffect(() => {
    const element = name.current!;
    const opening = previous.current && !collapsed;
    previous.current = collapsed;
    animation.current?.cancel();
    element.style.opacity = collapsed ? '0' : '1';
    if (reduced) {
      animation.current?.cancel();
      if (pending.current !== null) {
        commit.current(pending.current);
        pending.current = null;
      }
    }
    if (opening && !reduced && !document.hidden) {
      animation.current = element.animate(
        [
          { opacity: 0, transform: 'translateX(-6px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        { delay: 260, duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
      );
      animation.current.id = 'brand-reveal';
    }
    return () => {
      ++generation.current;
      animation.current?.cancel();
    };
  }, [collapsed, reduced, name]);
  function toggle() {
    const next = !(pending.current ?? current.current),
      token = ++generation.current;
    const element = name.current!;
    const opacity = getComputedStyle(element).opacity;
    animation.current?.cancel();
    pending.current = next;
    if (!next || reduced || document.hidden || getComputedStyle(element).display === 'none') {
      pending.current = null;
      commit.current(next);
      if (!next && !current.current && !reduced && !document.hidden) {
        animation.current = element.animate([{ opacity }, { opacity: 1 }], { duration: 160 });
        animation.current.id = 'brand-reverse';
      }
      return;
    }
    const fade = element.animate(
      [
        { opacity, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(-6px)' },
      ],
      { duration: 180, easing: 'ease-out', fill: 'forwards' },
    );
    animation.current = fade;
    fade.id = 'brand-dismiss';
    void fade.finished
      .then(() => {
        if (generation.current === token) {
          pending.current = null;
          commit.current(next);
        }
      })
      .catch(() => {
        /* Interrompida por nova intenção, redução ou desmontagem. */
      });
  }
  return toggle;
}
