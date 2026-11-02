import type { NavigationObject } from './animation';

// Desenhos originais; mesmas partes articuladas e ciclo finito da navegação.
export function EngravedObject({ kind }: { kind: NavigationObject }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'profile' && (
        <>
          <g data-part="profile-head" style={{ transformOrigin: '32px 31px' }}>
            <path d="M23 43c-5-4-7-10-6-17 1-9 7-15 16-15 8 0 13 5 13 12l-1 5 6 7-6 2-1 7c-.5 3-4 4-9 2" />
            <path d="M18 29c5-2 8-6 9-11 4 4 10 6 18 5" />
          </g>
          <path
            data-part="profile-shoulders"
            d="M23 43v4l-5 7h25l-8-8"
            style={{ transformOrigin: '32px 48px' }}
          />
        </>
      )}
      {kind === 'focus' && (
        <>
          <ellipse cx="32" cy="45" rx="24" ry="9" />
          <path d="m22 45 13-31 8 31Z" fill="currentColor" fillOpacity=".12" />
          <path data-part="hand" d="m32 44 3-30" style={{ transformOrigin: '32px 44px' }} />
          <path d="m15 44 4 1m27-1 3-1m-18 8v-3" />
        </>
      )}
      {kind === 'habits' && (
        <>
          <path d="M12 19h40v35H12Z" fill="currentColor" fillOpacity=".06" />
          <g data-part="page" style={{ transformOrigin: '32px 25px' }}>
            <path d="M12 19h40v35H12Zm0 10h40M22 12v13m20-13v13" />
          </g>
          <path
            data-part="check"
            d="m23 41 6 6 12-13"
            style={{ transformOrigin: '32px 41px' }}
            strokeWidth="3"
          />
        </>
      )}
      {kind === 'production' && (
        <>
          {[
            { x: 11, y: 37, h: 17 },
            { x: 27, y: 25, h: 29 },
            { x: 43, y: 11, h: 43 },
          ].map(({ x, y, h }, index) => (
            <g key={x} data-part={`bar-${index}`} className="object-bar">
              <path d={`M${x} ${y}h8v${h}H${x}Z`} fill="currentColor" fillOpacity="0" />
              <path d={`m${x + 3} ${y + 4}v${h - 7}`} strokeWidth="1" />
            </g>
          ))}
        </>
      )}
    </g>
  );
}
