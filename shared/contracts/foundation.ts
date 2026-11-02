import type { MaintenanceAPI } from './maintenance';
import type { ProductionAPI } from './production';
import type { BackupAPI } from './backup';
import type { HabitsAPI } from './habits';
import type { DesktopAPI } from './desktop';
import type { ShellDialogAPI } from './shell-dialog';
import type { TimerAPI } from './timer';
import type { MiniAPI } from './mini';
import type { Theme } from './appearance';
import type { ShortcutAPI } from './welcome';
import type { WindowControlAPI } from './window-control';
import { z } from 'zod';
import { appVersion } from '../version';

export const foundationSchema = z
  .object({
    version: z.literal(appVersion),
    runtime: z
      .object({ electron: z.string(), node: z.string(), chrome: z.string(), abi: z.string() })
      .strict(),
    storage: z.enum(['ready', 'error']),
  })
  .strict();
export type Foundation = z.infer<typeof foundationSchema>;
export interface KronoAPI {
  maintenance?: MaintenanceAPI;
  foundation: () => Promise<Foundation>;
  timer?: TimerAPI;
  desktop?: DesktopAPI;
  shellDialog?: ShellDialogAPI;
  habits?: HabitsAPI;
  production?: ProductionAPI;
  backup?: BackupAPI;
  mini?: MiniAPI;
  shortcut?: ShortcutAPI;
  windowControl?: WindowControlAPI;
  windowTheme?: (theme: Theme) => Promise<void>;
}
