import { z } from 'zod';
import { preferencesSchema, alertSchema } from '../../shared/contracts/desktop';
import type { DesktopRepository } from './desktop-repository';
export function workerDesktopRepository(
  request: (type: string, value?: unknown) => Promise<unknown>,
): DesktopRepository {
  return {
    preferences: async () => preferencesSchema.parse(await request('desktop:preferences')),
    update: async (value) => preferencesSchema.parse(await request('desktop:update', value)),
    acknowledgeHide: async () => {
      await request('desktop:hide-seen');
    },
    recoverAlerts: async () => {
      await request('desktop:recover');
    },
    pending: async () =>
      z
        .array(z.object({ sessionId: z.string().uuid(), phase: alertSchema.shape.phase }).strict())
        .max(20)
        .parse(await request('desktop:pending')),
    claim: async (id) => z.boolean().parse(await request('desktop:claim', id)),
    outcome: async (value) => {
      await request('desktop:outcome', value);
    },
    alerts: async () =>
      z
        .object({ alerts: z.array(alertSchema).max(5), unread: z.number().int().nonnegative() })
        .strict()
        .parse(await request('desktop:alerts')),
    dismiss: async (id) => {
      await request('desktop:dismiss', id);
    },
  };
}
