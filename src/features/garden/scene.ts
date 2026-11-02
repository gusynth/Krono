import { gardenPeriod, type GardenChapter, type GardenPeriod } from '../../../shared/domain/garden';

export type SceneState = {
  chapter: GardenChapter['id'];
  stage: number;
  workTime: number;
  skyTime: number;
  working: boolean;
  date: Date;
};
const palettes: Record<
  GardenPeriod,
  {
    sky: string;
    far: string;
    near: string;
    cloud: string;
    light: string;
    night: boolean;
    x: number;
  }
> = {
  morning: {
    sky: '#8eaba5',
    far: '#738d83',
    near: '#667864',
    cloud: '#d5d8be',
    light: '#efdab0',
    night: false,
    x: 285,
  },
  afternoon: {
    sky: '#b2a28a',
    far: '#928d70',
    near: '#797a59',
    cloud: '#dac7a4',
    light: '#f0cf8b',
    night: false,
    x: 93,
  },
  night: {
    sky: '#222d40',
    far: '#343c49',
    near: '#39463f',
    cloud: '#4e5968',
    light: '#d2d8c3',
    night: true,
    x: 293,
  },
  late: {
    sky: '#1d2634',
    far: '#293541',
    near: '#303d39',
    cloud: '#3c4a56',
    light: '#bdc9c7',
    night: true,
    x: 105,
  },
};
/** Um quadro local de 384×202. O movimento nunca calcula nem concede experiência. */
export function paintGarden(c: CanvasRenderingContext2D, state: SceneState) {
  const { chapter, stage, workTime: t, skyTime, working, date } = state;
  const period = gardenPeriod(date.getHours() + date.getMinutes() / 60),
    sky = palettes[period];
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const poly = (points: number[][], color: string) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
    c.closePath();
    c.fill();
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  const stone = (x: number, y: number, w = 22, h = 9) => {
    r(x, y, w, h, '#756e56');
    r(x, y, w, h - 3, '#a49a7c');
    r(x + 2, y + 1, w - 4, 1, '#c5bba0');
  };
  const column = (x: number, y: number, h: number) => {
    stone(x - 4, y, 20, 6);
    r(x, y - h, 12, h, '#756e56');
    r(x + 1, y - h, 8, h - 2, '#a49a7c');
    r(x + 2, y - h + 1, 2, h - 4, '#c5bba0');
    stone(x - 4, y - h - 5, 20, 5);
  };
  const tree = (x: number, y: number) => {
    r(x - 1, y - 30, 4, 30, '#79694d');
    for (const [dx, dy, w, h] of [
      [0, -40, 18, 12],
      [-11, -31, 17, 10],
      [12, -34, 17, 11],
      [-2, -48, 15, 10],
    ]) {
      r(x + dx! - w! / 2, y + dy!, w!, h!, '#566344');
      r(x + dx! - w! / 2 + 2, y + dy!, w! - 4, 3, '#8d9568');
    }
  };
  const pot = (x: number, y: number) => {
    r(x - 5, y - 9, 10, 3, '#a27454');
    r(x - 3, y - 6, 7, 6, '#865c42');
    r(x, y - 18, 1, 10, '#566344');
    r(x - 4, y - 16, 4, 2, '#8d9568');
    r(x + 1, y - 19, 4, 3, '#b0b981');
  };
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, 384, 202);
  r(0, 0, 384, 202, sky.sky);
  if (sky.night) {
    for (let i = 0; i < 16; i++) {
      c.globalAlpha = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(skyTime * 0.35 + i * 2));
      r((i * 67 + 29) % 376, 9 + ((i * 23) % 65), 1, 1, sky.light);
    }
    c.globalAlpha = 1;
  }
  const x = sky.x,
    y = period === 'late' ? 35 : 25;
  c.globalAlpha = 0.07;
  oval(x + 8, y + 8, 21, 21, sky.light);
  c.globalAlpha = 1;
  r(x + 3, y, 11, 17, sky.light);
  r(x, y + 3, 17, 11, sky.light);
  r(x - 1, y + 6, 19, 5, sky.light);
  if (sky.night) {
    r(x + 6, y - 2, 13, 14, sky.sky);
    r(x + 10, y + 11, 7, 3, sky.sky);
  }
  c.globalAlpha = 0.35;
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 149 + 35 + skyTime * (i === 1 ? 0.32 : 0.5)) % 490) - 50,
      cy = 22 + i * 16;
    r(cx, cy, 43, 3, sky.cloud);
    r(cx + 8, cy - 4, 24, 4, sky.cloud);
    r(cx + 17, cy - 7, 11, 3, sky.cloud);
  }
  c.globalAlpha = 1;
  poly(
    [
      [0, 87],
      [34, 58],
      [65, 73],
      [108, 39],
      [155, 76],
      [208, 49],
      [251, 77],
      [306, 40],
      [350, 68],
      [384, 55],
      [384, 160],
      [0, 160],
    ],
    sky.far,
  );
  poly(
    [
      [0, 112],
      [39, 89],
      [83, 104],
      [128, 70],
      [181, 108],
      [234, 79],
      [296, 98],
      [344, 76],
      [384, 100],
      [384, 160],
      [0, 160],
    ],
    sky.near,
  );
  poly(
    [
      [37, 129],
      [258, 99],
      [353, 135],
      [306, 185],
      [70, 195],
      [20, 163],
    ],
    '#3b3529',
  );
  poly(
    [
      [37, 122],
      [258, 93],
      [353, 129],
      [306, 175],
      [70, 185],
      [20, 153],
    ],
    '#554735',
  );
  poly(
    [
      [37, 122],
      [258, 93],
      [353, 129],
      [306, 167],
      [70, 177],
      [20, 153],
    ],
    '#69664a',
  );
  for (let i = 0; i < 11; i++) {
    r(53 + i * 22, 164 - (i % 3) * 3, 13, 2, '#777458');
    r(60 + i * 22, 128 + (i % 4) * 5, 10, 2, '#79785c');
  }
  for (let i = 0; i < 7; i++) stone(69 + i * 23, 171 - i * 2, 21, 7);
  const restored = chapter !== 'garden' || stage > 0;
  column(69, 118, restored ? 54 : 26);
  column(129, 109, restored ? 54 : 17);
  if (restored) {
    stone(62, 54, 83, 8);
    poly(
      [
        [59, 54],
        [100, 33],
        [148, 54],
      ],
      '#756e56',
    );
    poly(
      [
        [64, 53],
        [100, 38],
        [142, 53],
      ],
      '#a49a7c',
    );
  } else {
    stone(91, 117, 20, 6);
    stone(106, 124, 17, 7);
  }
  r(193, 131, 59, 24, '#342d23');
  r(195, 130, 59, 2, '#92866a');
  r(193, 154, 59, 3, '#756e56');
  for (let i = 0; i < 3; i++) {
    const px = 201 + i * 17;
    r(px, 137, 2, 8, '#566344');
    r(px - 3, 136, 4, 2, '#8d9568');
    if (stage > 0) {
      r(px + 1, 129, 2, 12, '#566344');
      r(px + 3, 128, 5, 3, '#b0b981');
    }
  }
  pot(154, 124);
  pot(177, 117);
  if (stage > 0 || chapter !== 'garden') tree(292, 126);
  if (stage > 1) {
    tree(326, 144);
    tree(49, 150);
    pot(158, 151);
    pot(181, 162);
  }
  if (chapter === 'courtyard') {
    for (let i = 0; i < 3; i++) stone(169 + i * 27, 107, 23, 7);
    stone(263, 118, 28, 7);
    stone(270, 105, 14, 14);
    r(271, 105, 12, 2, '#a2b4a0');
    r(276, 93, 2, 15, '#62756e');
    r(272, 93, 10, 2, '#a2b4a0');
    column(323, 150, stage > 0 ? 35 : 19);
  }
  if (chapter === 'library') {
    stone(246, 131, 64, 8);
    r(251, 81, 51, 50, '#70563e');
    r(255, 84, 43, 43, '#342d23');
    for (let row = 0; row < 3; row++) {
      r(253, 96 + row * 14, 47, 3, '#a49a7c');
      for (let i = 0; i < (stage + 1) * 2; i++)
        r(258 + i * 6, 86 + row * 14, 4, 10, ['#a27454', '#8d9568', '#798e91'][i % 3]!);
    }
    stone(155, 143, 27, 5);
    r(159, 148, 3, 12, '#756e56');
    r(177, 148, 3, 12, '#756e56');
    r(160, 139, 18, 3, '#e0d3ad');
    if (stage > 0) {
      r(93, 80, 18, 23, '#70563e');
      r(96, 83, 12, 16, '#e0d3ad');
      r(98, 87, 8, 1, '#a99d7e');
      r(98, 91, 8, 1, '#a99d7e');
    }
  }
  if (chapter === 'observatory') {
    stone(258, 131, 47, 8);
    r(279, 106, 3, 25, '#a49a7c');
    c.strokeStyle = '#c6a76b';
    c.lineWidth = 1;
    for (const angle of [-0.5, 0.5]) {
      c.beginPath();
      c.ellipse(280, 91, 21, 12, angle, 0, Math.PI * 2);
      c.stroke();
    }
    r(278, 89, 4, 4, '#c5bba0');
    if (stage > 0) {
      poly(
        [
          [168, 132],
          [181, 109],
          [184, 111],
          [173, 133],
        ],
        '#a49a7c',
      );
      poly(
        [
          [178, 104],
          [204, 93],
          [208, 100],
          [181, 111],
        ],
        '#b7a682',
      );
      r(168, 132, 23, 2, '#756e56');
    }
    if (stage > 1) {
      stone(93, 98, 24, 4);
      r(97, 76, 16, 21, '#313c48');
      r(104, 81, 1, 10, '#c6a76b');
      r(100, 85, 9, 1, '#c6a76b');
    }
  }
  const q = t % 26;
  let ax = 135,
    ay = 127,
    task = 'idle',
    dir = 1;
  if (working) {
    if (q < 4) {
      ax += (70 * q) / 4;
      ay += (26 * q) / 4;
      task = 'walk';
    } else if (q < 8) {
      ax = 205;
      ay = 153;
      task = 'plant';
    } else if (q < 11) {
      ax = 205;
      ay = 153;
      task = 'water';
    } else if (q < 16) {
      ax = 205 - (96 * (q - 11)) / 5;
      ay = 153 - (25 * (q - 11)) / 5;
      task = 'walk';
      dir = -1;
    } else if (q < 22) {
      ax = 109;
      ay = 128;
      task = 'build';
    } else {
      ax = 109 + (26 * (q - 22)) / 4;
      ay = 128 - (q - 22) / 4;
      task = 'walk';
    }
  }
  // Mudança temporária de solo acompanha o gesto; desbloqueios dependem só do crédito.
  if (working && q >= 4) {
    r(210, 148, 8, 2, q >= 8 ? '#44362a' : '#6f5137');
    if (q < 6.5) {
      r(211, 146, 4, 2, '#251f19');
      if (q > 5.3) r(212, 146, 1, 1, '#c6a76b');
    } else if (q >= 10) {
      const g = Math.min(7, 2 + Math.floor((q - 10) * 0.8));
      r(212, 148 - g, 1, g, '#566344');
      r(210, 147 - g, 3, 2, '#8d9568');
    }
  }
  const step = Math.floor(t * 6) % 4,
    bend = task === 'plant' ? 5 : 0,
    bob = task === 'walk' ? step % 2 : 0;
  c.save();
  c.globalAlpha = 0.22;
  oval(Math.round(ax), Math.round(ay) + 1, 5, 1, '#24231d');
  c.restore();
  c.save();
  c.translate(Math.round(ax), Math.round(ay) + bob);
  c.scale(dir, 1);
  const head = -31 + bend;
  r(-5, head + 2, 9, 9, '#d6af7e');
  r(-6, head, 10, 3, '#42392d');
  r(-6, head + 2, 2, 5, '#42392d');
  r(1, head + 5, 1, working && t % 5.8 > 5.65 ? 1 : 2, '#2c2923');
  r(-2, head + 11, 4, 2, '#d6af7e');
  r(-5, -18 + bend, 9, 12 - bend, '#a99d7e');
  r(-5, -18 + bend, 4, 10 - bend, '#e0d3ad');
  r(-5, -8, 9, 1, '#a99d7e');
  if (task === 'plant') {
    r(-7, -5, 8, 3, '#a99d7e');
    r(-7, -3, 4, 3, '#514333');
    r(1, -4, 5, 3, '#514333');
  } else {
    const stride = task === 'walk' ? [0, 2, 0, -2][step]! : 0;
    r(-4 + stride, -6, 3, 5, '#ae805d');
    r(1 - stride, -6, 3, 5, '#d6af7e');
    r(-5 + stride, -1, 5, 2, '#514333');
    r(1 - stride, -1, 5, 2, '#514333');
  }
  if (task === 'plant') {
    const reach = step < 2 ? 0 : 3;
    r(3, -13, 4, 3, '#d6af7e');
    r(6, -11, 2, 5 + reach, '#d6af7e');
    r(7, -5 + reach, 4, 2, '#d6af7e');
    if (q < 5.3) r(8, -7 + reach, 2, 2, '#c6a76b');
  } else if (task === 'water') {
    r(3, -16, 6, 3, '#d6af7e');
    r(8, -15, 2, 5, '#ae805d');
    r(9, -12, 7, 6, '#62756e');
    r(14, -14, 3, 3, '#a2b4a0');
    r(15, -10, 5, 2, '#a2b4a0');
    for (let i = 0; i < 3; i++) r(19 + i, -7 + ((step + i) % 4) * 2, 1, 2, '#b0c8b9');
  } else if (task === 'build') {
    if (step >= 2) {
      r(3, -16, 6, 3, '#d6af7e');
      r(8, -14, 3, 5, '#ae805d');
      r(10, -9, 9, 2, '#aa8e62');
      r(17, -12, 4, 7, '#c5bba0');
    } else {
      r(3, -19, 3, 6, '#d6af7e');
      r(5, -23, 3, 5, '#d6af7e');
      r(7, -29, 2, 10, '#aa8e62');
      r(4, -30, 8, 4, '#c5bba0');
    }
  } else {
    const swing = task === 'walk' ? [-2, 0, 2, 0][step]! : 0;
    r(-5, -16, 3, 4, '#e0d3ad');
    r(-6, -12 + swing, 3, 6, '#ae805d');
    r(4, -15, 3, 4, '#d6af7e');
    r(5, -12 - swing, 2, 5, '#d6af7e');
  }
  c.restore();
  if (sky.night) {
    c.save();
    c.globalAlpha = 0.2;
    poly(
      [
        [37, 122],
        [258, 93],
        [353, 129],
        [353, 135],
        [306, 185],
        [70, 195],
        [20, 163],
        [20, 153],
      ],
      '#102039',
    );
    c.restore();
    for (const lx of [149, 281]) {
      r(lx, 144, 2, 9, '#756e56');
      r(lx - 2, 139, 6, 6, '#b59152');
      r(lx - 1, 140, 4, 3, '#ead6a1');
    }
  }
}
