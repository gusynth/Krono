import { themeSchema, type Theme } from '../../shared/contracts/appearance';
export const themes = [
  { id: 'original', name: 'Krono', description: 'Mineral oliva, mármore e luz difusa.' },
  {
    id: 'terminal',
    name: 'Terminal / ASCII',
    description: 'Monoespaçado, fósforo verde e caracteres.',
  },
  { id: 'aero', name: 'Aero', description: 'Profundidade, luz e superfícies aquáticas.' },
  {
    id: 'classic',
    name: 'Windows 95 escuro',
    description: 'Geometria clássica, relevo e grafite.',
  },
] as const;
export type { Theme };
export const isTheme = (value: unknown): value is Theme => themeSchema.safeParse(value).success;
