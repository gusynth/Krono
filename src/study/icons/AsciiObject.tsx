import { useEffect, useRef } from 'react';
import type { NavigationObject } from './animation';
const glyphs = { profile: '(@)', focus: '(o)', habits: '[#]', production: '|_|' };
export function AsciiObject({
  kind,
  activation,
  reduce,
}: {
  kind: NavigationObject;
  activation: number;
  reduce: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null),
    consumed = useRef(activation);
  useEffect(() => {
    if (activation === consumed.current) return;
    consumed.current = activation;
    if (!activation || reduce) return;
    const animation = root.current!.animate(
      [
        { opacity: 1 },
        { opacity: 0.35, offset: 0.1 },
        { opacity: 1, offset: 0.25 },
        { opacity: 0.7, offset: 0.5 },
        { opacity: 1 },
      ],
      { duration: 2000, iterations: 1 },
    );
    animation.id = 'ascii-activation';
    return () => animation.cancel();
  }, [activation, reduce]);
  return (
    <span ref={root} className="ascii-object" aria-hidden="true">
      {glyphs[kind]}
    </span>
  );
}
