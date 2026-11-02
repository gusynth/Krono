import { useEffect, useId, useRef } from 'react';
import { animateObject, type NavigationObject as ObjectKind } from './animation';
import { EngravedObject } from './EngravedObject';

interface Props {
  kind: ObjectKind;
  activation: number;
  reduceMotion: boolean;
  reduceEffects: boolean;
  visible: boolean;
  engraved?: boolean;
}
export function NavigationObject({
  kind,
  activation,
  reduceMotion,
  reduceEffects,
  visible,
  engraved = false,
}: Props) {
  const root = useRef<SVGSVGElement>(null);
  const consumed = useRef(0);
  const animations = useRef<Animation[]>([]);
  const id = useId();
  useEffect(() => {
    const cancel = () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
    cancel();
    if (activation === consumed.current) return cancel;
    consumed.current = activation;
    if (activation && visible && !reduceMotion && root.current) {
      animations.current = animateObject(root.current, kind, !reduceEffects);
      animations.current.forEach((animation) => {
        void animation.finished
          .then(() => {
            animations.current = animations.current.filter((item) => item !== animation);
          })
          .catch(() => {
            animations.current = animations.current.filter((item) => item !== animation);
          });
      });
    }
    return cancel;
  }, [activation, kind, reduceEffects, reduceMotion, visible, engraved]);

  if (engraved)
    return (
      <svg
        ref={root}
        className={`navigation-object engraved-object object-${kind}`}
        data-object={kind}
        viewBox="0 0 64 64"
        width="34"
        height="34"
        aria-hidden="true"
        focusable="false"
      >
        <EngravedObject kind={kind} />
      </svg>
    );

  // Material local: borda vítrea, face acetinada e luz única superior esquerda.
  return (
    <svg
      ref={root}
      className={`navigation-object object-${kind}`}
      data-object={kind}
      viewBox="0 0 64 64"
      width="34"
      height="34"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2=".85" y2="1">
          <stop stopColor="#cdd3db" stopOpacity=".76" />
          <stop offset=".22" stopColor="#7e8997" stopOpacity=".48" />
          <stop offset=".6" stopColor="#485361" stopOpacity=".66" />
          <stop offset="1" stopColor="#8995a6" stopOpacity=".4" />
        </linearGradient>
        <linearGradient id={`${id}-bars`} x1="0" y1="0" x2=".85" y2="1">
          <stop stopColor="#ccd3db" stopOpacity=".82" />
          <stop offset=".22" stopColor="#9aa5b2" stopOpacity=".68" />
          <stop offset=".6" stopColor="#788491" stopOpacity=".7" />
          <stop offset="1" stopColor="#a1acb9" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#e0e5eb" stopOpacity=".8" />
          <stop offset=".4" stopColor="#a4afbc" stopOpacity=".28" />
          <stop offset=".74" stopColor="#333a46" stopOpacity=".25" />
          <stop offset="1" stopColor="#b6bfcb" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={`${id}-satin`} x1=".1" y1="0" x2=".8" y2="1">
          <stop stopColor="#c7ccd3" />
          <stop offset=".55" stopColor="#adb5c0" />
          <stop offset="1" stopColor="#929ba8" />
        </linearGradient>
        <linearGradient id={`${id}-red`} x1="0" y1="0" x2=".7" y2="1">
          <stop stopColor="#ed8c83" stopOpacity=".94" />
          <stop offset=".25" stopColor="#e64f45" stopOpacity=".91" />
          <stop offset="1" stopColor="#922d2c" stopOpacity=".96" />
        </linearGradient>
        <linearGradient id={`${id}-red-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffb0a5" stopOpacity=".8" />
          <stop offset=".5" stopColor="#ff7668" stopOpacity=".18" />
          <stop offset="1" stopColor="#ff8b7b" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <ellipse
        className="object-shadow"
        cx="32"
        cy="58"
        rx="19"
        ry="1.5"
        fill="#000"
        opacity=".18"
      />
      {kind === 'profile' && (
        <>
          <g data-part="profile-shoulders" style={{ transformOrigin: '32px 48px' }}>
            <path
              d="M13 53c0-12 8-19 19-19s19 7 19 19c-9 5-29 5-38 0Z"
              fill={`url(#${id}-glass)`}
              stroke={`url(#${id}-edge)`}
              strokeWidth="1.1"
            />
            <path
              d="M16 51c1-8 7-13 16-13 8 0 14 5 16 13-9 3-23 3-32 0Z"
              fill={`url(#${id}-satin)`}
              fillOpacity=".85"
            />
          </g>
          <g data-part="profile-head" style={{ transformOrigin: '32px 31px' }}>
            <circle
              cx="32"
              cy="21"
              r="12"
              fill={`url(#${id}-glass)`}
              stroke={`url(#${id}-edge)`}
              strokeWidth="1.1"
            />
            <circle cx="31.5" cy="20.5" r="9.5" fill={`url(#${id}-satin)`} />
            <path
              data-part="profile-reflection"
              d="M22 18c1-5 5-7 9-7"
              fill="none"
              stroke="#f5f5f7"
              strokeOpacity=".7"
              opacity=".2"
              strokeLinecap="round"
            />
          </g>
        </>
      )}
      {kind === 'focus' && (
        <>
          <path d="M28 8h7v8h-7z" fill="#68717e" />
          <rect
            x="25"
            y="5"
            width="13"
            height="5"
            rx="1.7"
            fill={`url(#${id}-red)`}
            stroke={`url(#${id}-red-edge)`}
            strokeWidth=".8"
          />
          <circle cx="32" cy="34" r="23" fill="#282e38" />
          <circle
            cx="31"
            cy="32"
            r="23"
            fill={`url(#${id}-glass)`}
            stroke={`url(#${id}-edge)`}
            strokeWidth="1.2"
          />
          <circle cx="31" cy="32" r="19.3" fill="#555f6e" fillOpacity=".6" />
          <circle cx="31" cy="32.5" r="18.2" fill={`url(#${id}-satin)`} />
          <path
            d="M14 31a17 17 0 0 1 17-16"
            stroke="#525d6e"
            strokeOpacity=".45"
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M31 18v3m0 23v3M17 32h3m22 0h3"
            stroke="#4d5766"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path d="m31 32 7 4" stroke="#3e4755" strokeWidth="2.4" strokeLinecap="round" />
          <g data-part="hand" className="object-hand">
            <path d="M31 33V23" stroke="#b62e29" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="31" cy="32" r="2.2" fill="#a92f2c" />
          </g>
          <path
            d="M10 30a21 21 0 0 1 18-19"
            fill="none"
            stroke="#e0e5eb"
            strokeOpacity=".43"
            strokeWidth=".9"
            strokeLinecap="round"
          />
          <path
            data-part="reflection"
            className="object-reflection"
            strokeDasharray="11 24"
            d="M11 27a21 21 0 0 1 13-14"
            fill="none"
            stroke="#e6e1d8"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === 'habits' && (
        <>
          <rect x="11" y="17" width="43" height="39" rx="4" fill="#323946" />
          <rect
            x="10"
            y="15"
            width="43"
            height="39"
            rx="4"
            fill={`url(#${id}-glass)`}
            stroke={`url(#${id}-edge)`}
            strokeWidth="1.2"
          />
          <path
            d="M14 16h35a3 3 0 0 1 3 3v8H11v-8a3 3 0 0 1 3-3"
            fill={`url(#${id}-red)`}
            stroke={`url(#${id}-red-edge)`}
            strokeWidth=".8"
          />
          <path
            d="M14 18h33"
            stroke="#ffd3ca"
            strokeOpacity=".4"
            strokeWidth=".8"
            strokeLinecap="round"
          />
          <g data-part="page" className="object-page">
            <path d="M13 27h37v21a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z" fill={`url(#${id}-satin)`} />
            <path d="M14 28h35" stroke="#596373" strokeOpacity=".55" strokeWidth="1.4" />
            <path
              d="M20 35h8m7 0h7M20 42h8"
              stroke="#626d7d"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <g data-part="check" className="object-check">
              <rect x="35" y="39" width="13" height="11" rx="2.5" fill="#30d158" />
              <path
                d="m38 44 2 2 4.5-4.5"
                fill="none"
                stroke="#163a24"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
          <path d="M21 12v7m21-7v7" stroke="#535e6e" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M20.5 12v6m21-6v6" stroke="#bcc5d0" strokeWidth="1.1" strokeLinecap="round" />
          <path
            d="M11 30v17a6 6 0 0 0 3 5"
            fill="none"
            stroke="#d4dce5"
            strokeOpacity=".35"
            strokeWidth=".8"
          />
        </>
      )}
      {kind === 'production' && (
        <>
          {[
            { x: 10, y: 36, h: 18 },
            { x: 26, y: 25, h: 29 },
            { x: 42, y: 14, h: 40 },
          ].map(({ x, y, h }, index) => (
            <g key={x} data-part={`bar-${index}`} className="object-bar">
              <path
                d={`M${x + 11} ${y}l2-1v${h}l-2 1z`}
                fill="#343d4b"
                fillOpacity=".65"
                stroke="#8995a6"
                strokeOpacity=".3"
                strokeWidth=".6"
              />
              <rect
                x={x}
                y={y}
                width="11"
                height={h}
                rx="1.5"
                fill={`url(#${id}-bars)`}
                stroke={`url(#${id}-edge)`}
                strokeWidth="1.2"
              />
              <path
                d={`M${x + 1} ${y + 1.5}v${h - 4}`}
                stroke="#dce3eb"
                strokeOpacity=".46"
                strokeWidth=".8"
                strokeLinecap="round"
              />
              <path d={`M${x + 1} ${y}l2-1h9l-2 1`} fill="#bac4d1" fillOpacity=".28" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
