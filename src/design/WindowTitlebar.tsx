import { useEffect, useState } from 'react';
import type { WindowControlState } from '../../shared/contracts/window-control';

interface Overlay extends EventTarget {
  visible: boolean;
}

export function WindowTitlebar({ compact = false }: { compact?: boolean }) {
  const desktop = Boolean(typeof window !== 'undefined' && window.krono?.timer);
  const overlay =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { windowControlsOverlay?: Overlay }).windowControlsOverlay
      : undefined;
  const [overlayVisible, setOverlayVisible] = useState(!!overlay?.visible);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!overlay) return;
    const update = () => setOverlayVisible(overlay.visible);
    overlay.addEventListener('geometrychange', update);
    return () => overlay.removeEventListener('geometrychange', update);
  }, [overlay]);

  useEffect(() => {
    if (!desktop || !window.krono?.windowControl) return;
    const off = window.krono.windowControl.subscribeMaximized(setMaximized);
    void window.krono.windowControl
      .command('state')
      .then((state: WindowControlState | void) => {
        if (state && typeof state.maximized === 'boolean') setMaximized(state.maximized);
      })
      .catch(() => {});
    return () => {
      off();
    };
  }, [desktop]);

  const visible = desktop || overlayVisible;
  if (!visible) return null;

  return (
    <>
      <div className="window-titlebar" data-testid="window-titlebar">
        <span>Krono</span>
      </div>
      {desktop && (
        <div className="window-controls" aria-label="Controles da janela">
          <button
            type="button"
            className="window-control window-control-minimize"
            aria-label="Minimizar janela"
            title="Minimizar janela"
            onClick={() => {
              void window.krono?.windowControl?.command('minimize');
            }}
          >
            <svg
              width="10"
              height="2"
              viewBox="0 0 10 2"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <rect width="10" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>
          {!compact && (
            <button
              type="button"
              className="window-control window-control-maximize"
              aria-label={maximized ? 'Restaurar janela' : 'Maximizar janela'}
              title={maximized ? 'Restaurar janela' : 'Maximizar janela'}
              onClick={() => {
                void window.krono?.windowControl?.command('maximize');
              }}
            >
              {maximized ? (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect
                    x="2.5"
                    y="0.75"
                    width="6.75"
                    height="6.75"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M0.75 3.5V8.25C0.75 9.07843 1.42157 9.75 2.25 9.75H7"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect
                    x="0.75"
                    y="0.75"
                    width="8.5"
                    height="8.5"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            className="window-control window-control-close"
            aria-label="Fechar janela"
            title="Fechar janela"
            onClick={() => {
              void window.krono?.windowControl?.command('close');
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
