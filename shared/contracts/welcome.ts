import { z } from 'zod';
export const introductionSchema = z
  .object({ version: z.literal(1), step: z.number().int().min(0).max(4), completed: z.boolean() })
  .strict();
export const globalShortcutSchema = z.enum([
  'off',
  'Control+Alt+K',
  'Control+Shift+K',
  'Control+Alt+Space',
]);
export type GlobalShortcutChoice = z.infer<typeof globalShortcutSchema>;
export const shortcutSnapshotSchema = z
  .object({
    configured: globalShortcutSchema,
    active: globalShortcutSchema,
    status: z.enum(['off', 'active', 'conflict', 'error']),
    message: z.string().nullable(),
  })
  .strict();
export type ShortcutSnapshot = z.infer<typeof shortcutSnapshotSchema>;
export interface ShortcutAPI {
  read: () => Promise<ShortcutSnapshot>;
  set: (value: GlobalShortcutChoice) => Promise<ShortcutSnapshot>;
  subscribe: (listener: (value: ShortcutSnapshot) => void) => () => void;
}
