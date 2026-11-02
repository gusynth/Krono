import { z } from 'zod';

export const windowControlActionSchema = z.enum(['minimize', 'maximize', 'close', 'state']);
export type WindowControlAction = z.infer<typeof windowControlActionSchema>;

export const windowControlStateSchema = z
  .object({
    maximized: z.boolean(),
    fullscreen: z.boolean(),
  })
  .strict();
export type WindowControlState = z.infer<typeof windowControlStateSchema>;

export interface WindowControlAPI {
  command: (action: WindowControlAction) => Promise<WindowControlState | void>;
  subscribeMaximized: (listener: (maximized: boolean) => void) => () => void;
}
