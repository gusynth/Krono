import { useLayoutEffect, useRef } from 'react';

/** Transição por mudança semântica; nunca recebe o tick do contador como chave. */
export function useContentMotion<T extends HTMLElement = HTMLSpanElement>(
  key: string,
  reduced: boolean,
) {
  const root = useRef<T>(null);
  const previous = useRef(key);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    animation.current?.cancel();
    const changed = previous.current !== key;
    previous.current = key;
    if (changed && !reduced && !document.hidden && root.current) {
      animation.current = root.current.animate(
        [
          { opacity: 0.45, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
      animation.current.id = 'semantic-content';
    }
    return () => animation.current?.cancel();
  }, [key, reduced]);
  return root;
}
