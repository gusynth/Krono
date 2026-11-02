import { z } from 'zod';

export const shellDialogSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['hide', 'quit']),
    canHide: z.boolean(),
    running: z.boolean(),
    storageError: z.boolean(),
  })
  .strict();
export const shellReplySchema = z
  .object({ id: z.string().uuid(), choice: z.enum(['hide', 'quit', 'cancel']) })
  .strict();
export type ShellDialogRequest = z.infer<typeof shellDialogSchema>;
export type ShellChoice = z.infer<typeof shellReplySchema>['choice'];
export interface ShellDialogAPI {
  read: () => Promise<ShellDialogRequest | null>;
  respond: (value: z.infer<typeof shellReplySchema>) => Promise<boolean>;
  subscribe: (listener: (value: ShellDialogRequest | null) => void) => () => void;
}
