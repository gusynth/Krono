export const motionPresets = {
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const },
  },
  reduced: {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 1 },
    transition: { duration: 0 },
  },
};

export const interfaceMotion = {
  enter: {
    frames: [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    duration: 260,
  },
  feedback: {
    frames: [
      { opacity: 0.55, transform: 'translateY(3px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    duration: 200,
  },
  easing: 'cubic-bezier(.2,.8,.2,1)',
};

export const settingsMotion = { selection: 240, exit: 110, enter: 260, distance: 8 } as const;
