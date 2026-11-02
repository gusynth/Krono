import { useLayoutEffect, type RefObject } from 'react';
import { interfaceMotion } from './motion';

/** Feedback decorativo dos estados confirmados. Não observa texto/ticks do contador. */
export function useInterfaceMotion(surface: RefObject<HTMLDivElement | null>, reduced: boolean) {
  useLayoutEffect(() => {
    const root = surface.current;
    if (!root) return;
    if (reduced) {
      root
        .querySelectorAll('.clean-main, .study-popover, .desktop-feedback')
        .forEach((element) =>
          element.getAnimations({ subtree: true }).forEach((animation) => animation.cancel()),
        );
      return;
    }
    const active = new Map<Element, Animation>();
    const entrances =
      '.habit-form, .focus-message, .habit-record, .production-goal, .production-history li, .desktop-feedback, .history-content, .profile-welcome, .profile-identity, .profile-overview, .profile-week, .daily-review';
    function play(element: Element, kind: 'enter' | 'feedback') {
      if (
        !element.getClientRects().length ||
        element.closest('[hidden], [inert]') ||
        document.hidden
      )
        return;
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > innerHeight) return;
      active.get(element)?.cancel();
      const preset = interfaceMotion[kind];
      const animation = element.animate(preset.frames, {
        duration: preset.duration,
        easing: interfaceMotion.easing,
      });
      animation.id = `interface-${kind}`;
      active.set(element, animation);
      animation.onfinish = animation.oncancel = () => {
        if (active.get(element) === animation) active.delete(element);
      };
    }
    const observer = new MutationObserver((records) => {
      const targets = new Map<Element, 'enter' | 'feedback'>();
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches(entrances)) targets.set(node, 'enter');
            node.querySelectorAll(entrances).forEach((element) => targets.set(element, 'enter'));
          }
        } else if (record.target instanceof Element) {
          const target = record.target;
          if (target.matches('.clean-time')) {
            const status = target.querySelector('.time-state');
            if (status) targets.set(status, 'feedback');
          } else if (target.matches('.habit-record')) {
            const status = target.querySelector('.habit-status');
            if (status) targets.set(status, 'feedback');
          } else if (target.matches('.example-check')) targets.set(target, 'feedback');
          else if (target.matches('.production-route') && record.attributeName === 'data-refresh')
            target
              .querySelectorAll('.production-metrics dd, .production-ring, .production-heatmap')
              .forEach((element) => targets.set(element, 'feedback'));
          else if (
            target.matches('.daily-review-content') &&
            record.attributeName === 'data-refresh'
          ) {
            const metrics = target.querySelector('.daily-review-metrics');
            if (metrics) targets.set(metrics, 'feedback');
          } else if (target.matches('details[open]')) {
            const content = target.querySelector(':scope > .history-content');
            if (content) targets.set(content, 'enter');
          }
        }
      }
      targets.forEach((kind, element) => play(element, kind));
      for (const [element, animation] of active)
        if (!element.isConnected || element.closest('[hidden], [inert], details:not([open])')) {
          animation.cancel();
          active.delete(element);
        }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-refresh',
        'data-state',
        'aria-pressed',
        'hidden',
        'aria-busy',
        'open',
      ],
    });
    return () => {
      observer.disconnect();
      active.forEach((animation) => animation.cancel());
      active.clear();
    };
  }, [surface, reduced]);
}
