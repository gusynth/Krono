/** Progressão derivada de crédito confirmado; não contém relógio nem escrita. */
export const gardenChapters = [
  {
    id: 'garden',
    name: 'Jardim',
    minutes: 0,
    endMinutes: 300,
    description: 'Canteiros, mudas e as primeiras árvores.',
  },
  {
    id: 'courtyard',
    name: 'Pátio',
    minutes: 300,
    endMinutes: 900,
    description: 'Colunas, caminhos de pedra e uma fonte.',
  },
  {
    id: 'library',
    name: 'Biblioteca',
    minutes: 900,
    endMinutes: 1800,
    description: 'Estantes, pergaminhos e um lugar de leitura.',
  },
  {
    id: 'observatory',
    name: 'Observatório',
    minutes: 1800,
    endMinutes: 3000,
    description: 'Um terraço com instrumentos para observar o céu.',
  },
] as const;
export type GardenChapter = (typeof gardenChapters)[number];
export function gardenProgress(eligibleMs: number) {
  if (!Number.isSafeInteger(eligibleMs) || eligibleMs < 0) throw new Error('INVALID_GARDEN_CREDIT');
  const minutes = Math.floor(eligibleMs / 60_000);
  const unlocked = gardenChapters.filter((chapter) => minutes >= chapter.minutes);
  const chapter = unlocked.at(-1)!;
  const span = chapter.endMinutes - chapter.minutes;
  const fraction = Math.min(1, (minutes - chapter.minutes) / span);
  return {
    minutes,
    level: 1 + Math.floor(minutes / 60),
    unlocked,
    chapter,
    fraction,
    stage: fraction >= 0.7 ? 2 : fraction >= 0.25 ? 1 : 0,
    remainingMinutes: Math.max(0, chapter.endMinutes - minutes),
    complete: minutes >= gardenChapters.at(-1)!.endMinutes,
  };
}
export type GardenPeriod = 'morning' | 'afternoon' | 'night' | 'late';
export function gardenPeriod(hour: number): GardenPeriod {
  return hour >= 6 && hour < 12
    ? 'morning'
    : hour >= 12 && hour < 18
      ? 'afternoon'
      : hour >= 18
        ? 'night'
        : 'late';
}
