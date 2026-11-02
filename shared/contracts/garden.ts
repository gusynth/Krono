import { z } from 'zod';

export const gardenPreferencesSchema = z
  .object({ version: z.literal(1), introductionSeen: z.boolean(), enabled: z.boolean().optional() })
  .strict();
export const gardenSnapshotSchema = z
  .object({
    version: z.literal(1),
    eligibleMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sessions: z.number().int().nonnegative(),
  })
  .strict();
export type GardenSnapshot = z.infer<typeof gardenSnapshotSchema>;
