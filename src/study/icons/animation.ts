export type NavigationObject = 'profile' | 'focus' | 'habits' | 'production';
export interface ObjectGesture {
  part: string;
  frames: Keyframe[];
  duration: number;
  delay?: number;
  decorativeLight?: boolean;
}

// Quatro momentos: resposta rápida, gesto principal, secundário e repouso.
export const objectGestures: Record<NavigationObject, ObjectGesture[]> = {
  profile: [
    {
      part: 'profile-head',
      duration: 2000,
      frames: [
        { transform: 'translateY(0px) rotate(0deg)', offset: 0 },
        { transform: 'translateY(-.4px) rotate(-2deg)', offset: 0.08 },
        { transform: 'translateY(.8px) rotate(5deg)', offset: 0.28 },
        { transform: 'translateY(-.6px) rotate(-3deg)', offset: 0.48 },
        { transform: 'translateY(.2px) rotate(1deg)', offset: 0.67 },
        { transform: 'translateY(0px) rotate(-.3deg)', offset: 0.84 },
        { transform: 'translateY(0px) rotate(0deg)', offset: 1 },
      ],
    },
    {
      part: 'profile-shoulders',
      duration: 2000,
      frames: [
        { transform: 'translateY(0px) scaleX(1)', offset: 0 },
        { transform: 'translateY(-.7px) scaleX(1.025)', offset: 0.22 },
        { transform: 'translateY(.3px) scaleX(.995)', offset: 0.48 },
        { transform: 'translateY(-.15px) scaleX(1.005)', offset: 0.72 },
        { transform: 'translateY(0px) scaleX(1)', offset: 1 },
      ],
    },
    {
      part: 'profile-reflection',
      duration: 760,
      delay: 400,
      decorativeLight: true,
      frames: [{ opacity: 0.2 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0.2 }],
    },
  ],
  focus: [
    {
      part: 'hand',
      duration: 2000,
      frames: [
        { transform: 'rotate(0deg)', offset: 0 },
        { transform: 'rotate(-7deg)', offset: 0.07 },
        { transform: 'rotate(62deg)', offset: 0.28 },
        { transform: 'rotate(57deg)', offset: 0.42 },
        { transform: 'rotate(66deg)', offset: 0.56 },
        { transform: 'rotate(3deg)', offset: 0.8 },
        { transform: 'rotate(-1deg)', offset: 0.9 },
        { transform: 'rotate(0deg)', offset: 1 },
      ],
    },
    {
      part: 'reflection',
      duration: 760,
      delay: 480,
      decorativeLight: true,
      frames: [
        { opacity: 0, strokeDashoffset: 21 },
        { opacity: 0.34, strokeDashoffset: 10, offset: 0.45 },
        { opacity: 0, strokeDashoffset: -11 },
      ],
    },
  ],
  habits: [
    {
      part: 'page',
      duration: 2000,
      frames: [
        { transform: 'translateY(0px) rotate(0deg)', offset: 0 },
        { transform: 'translateY(-1px) rotate(-3deg)', offset: 0.07 },
        { transform: 'translateY(-2px) rotate(-11deg)', offset: 0.27 },
        { transform: 'translateY(.5px) rotate(2deg)', offset: 0.48 },
        { transform: 'translateY(-.5px) rotate(-2deg)', offset: 0.64 },
        { transform: 'translateY(0px) rotate(.5deg)', offset: 0.82 },
        { transform: 'translateY(0px) rotate(0deg)', offset: 1 },
      ],
    },
    {
      part: 'check',
      duration: 1100,
      delay: 650,
      frames: [
        { opacity: 0.65, transform: 'scale(1)' },
        { opacity: 1, transform: 'scale(1.05)', offset: 0.25 },
        { opacity: 1, transform: 'scale(1)', offset: 0.6 },
        { opacity: 1, transform: 'scale(1)' },
      ],
    },
  ],
  production: [0, 1, 2].map((index) => ({
    part: `bar-${index}`,
    duration: 1800,
    delay: index * 100,
    frames: [
      { transform: 'scaleY(1)', filter: 'brightness(1)', offset: 0 },
      { transform: 'scaleY(.88)', filter: 'brightness(1)', offset: 0.07 },
      {
        transform: `scaleY(${[1.12, 1.09, 1.06][index]})`,
        filter: 'brightness(1.12)',
        offset: 0.3,
      },
      { transform: 'scaleY(1.025)', filter: 'brightness(1.06)', offset: 0.5 },
      { transform: 'scaleY(1.04)', filter: 'brightness(1.04)', offset: 0.65 },
      { transform: 'scaleY(1.005)', filter: 'brightness(1)', offset: 0.84 },
      { transform: 'scaleY(1)', filter: 'brightness(1)', offset: 1 },
    ],
  })),
};

export function animateObject(
  root: SVGSVGElement,
  kind: NavigationObject,
  reflections: boolean,
): Animation[] {
  return objectGestures[kind].flatMap((gesture) => {
    if (gesture.decorativeLight && !reflections) return [];
    const part = root.querySelector<SVGElement>(`[data-part="${gesture.part}"]`);
    if (!part) return [];
    const frames = reflections
      ? gesture.frames
      : gesture.frames.map(({ filter: _light, ...frame }) => {
          void _light;
          return frame;
        });
    const animation = part.animate(
      frames.map((frame) => ({ ...frame, easing: 'cubic-bezier(.2,.65,.3,1)' })),
      { duration: gesture.duration, delay: gesture.delay ?? 0, easing: 'linear', iterations: 1 },
    );
    animation.id = `krono-${kind}-${gesture.part}`;
    return [animation];
  });
}
