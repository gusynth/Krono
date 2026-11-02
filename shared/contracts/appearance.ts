import { z } from 'zod';
export const themeSchema = z.enum(['original', 'terminal', 'aero', 'classic']);
export type Theme = z.infer<typeof themeSchema>;
