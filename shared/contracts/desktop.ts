import { z } from 'zod';
import { profileSchema } from './profile';
import { globalShortcutSchema, introductionSchema } from './welcome';
import { timerConfigurationSchema } from './timer';
import { gardenPreferencesSchema } from './garden';
export const routinePreferences = z.object({
  habitOrder: z
    .array(z.string().uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'IDs repetidos')
    .optional(),
  autoBackup: z.boolean().optional(),
  startWithWindows: z.boolean().optional(),
  habitReminder: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  presets: z
    .array(
      z
        .object({ name: z.string().trim().min(1).max(30), configuration: timerConfigurationSchema })
        .strict(),
    )
    .max(6)
    .optional(),
});
export const preferencesSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    soundEnabled: z.boolean(),
    volume: z.number().min(0).max(1),
    notificationsEnabled: z.boolean(),
    pauseOnLock: z.boolean(),
    closeToTray: z.boolean(),
    firstHideSeen: z.boolean(),
    profile: profileSchema.optional(),
    introduction: introductionSchema.optional(),
    globalShortcut: globalShortcutSchema.optional(),
  })
  .extend({ ...routinePreferences.shape, garden: gardenPreferencesSchema.optional() })
  .strict();
export const preferencePatchSchema = preferencesSchema
  .pick({
    soundEnabled: true,
    volume: true,
    notificationsEnabled: true,
    pauseOnLock: true,
    closeToTray: true,
    profile: true,
    introduction: true,
    globalShortcut: true,
    autoBackup: true,
    startWithWindows: true,
    habitReminder: true,
    presets: true,
    habitOrder: true,
    garden: true,
  })
  .partial()
  .strict();
export const preferenceUpdateSchema = z
  .object({ expectedRevision: z.number().int().nonnegative(), patch: preferencePatchSchema })
  .strict();
export const deliverySchema = z.enum([
  'claimed',
  'requested',
  'shown',
  'failed',
  'unsupported',
  'disabled',
  'ambiguous',
  'finished',
]);
export const alertSchema = z
  .object({
    sessionId: z.string().uuid(),
    phase: z.enum(['focus', 'short-break', 'long-break', 'free']),
    notification: deliverySchema,
    sound: deliverySchema,
  })
  .strict();
export const desktopSnapshotSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    preferences: preferencesSchema,
    alerts: z.array(alertSchema).max(5),
    unread: z.number().int().nonnegative(),
    trayAvailable: z.boolean(),
    error: z.string().nullable(),
  })
  .strict();
export type DesktopPreferences = z.infer<typeof preferencesSchema>;
export type PreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;
export type CompletionAlert = z.infer<typeof alertSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type DesktopSnapshot = z.infer<typeof desktopSnapshotSchema>;
export const defaultPreferences = (): DesktopPreferences => ({
  version: 1,
  revision: 0,
  soundEnabled: true,
  volume: 0.4,
  notificationsEnabled: true,
  pauseOnLock: false,
  closeToTray: true,
  firstHideSeen: false,
});
export interface DesktopAPI {
  read: () => Promise<DesktopSnapshot>;
  update: (value: PreferenceUpdate) => Promise<DesktopSnapshot>;
  dismiss: (sessionId: string) => Promise<DesktopSnapshot>;
  preview: () => Promise<'finished' | 'failed' | 'disabled'>;
  subscribe: (listener: (value: DesktopSnapshot) => void) => () => void;
  onFocus: (listener: () => void) => () => void;
}
