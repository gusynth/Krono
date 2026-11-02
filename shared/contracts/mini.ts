import { z } from 'zod';
export const miniStateSchema = z
  .object({ active: z.boolean(), pinned: z.boolean(), comfortable: z.boolean().optional() })
  .strict();
export const miniActionSchema = z.enum(['read', 'enter', 'leave', 'pin', 'size']);
export type MiniState = z.infer<typeof miniStateSchema>;
export type MiniAction = z.infer<typeof miniActionSchema>;
export interface MiniAPI {
  command: (action: MiniAction) => Promise<MiniState>;
  subscribe: (listener: (value: unknown) => void) => () => void;
}
