import { z } from 'zod';
import { appVersion } from '../version';

export const backupAppVersionSchema = z.enum([
  '0.1.0',
  '1.0.0',
  '1.0.1',
  '1.0.2',
  '1.1.0',
  '1.2.0',
  '1.3.0',
  '1.3.1',
  '1.4.0',
  appVersion,
]);

export const backupSummarySchema = z
  .object({
    format: z.literal(1),
    schema: z.literal(5),
    appVersion: backupAppVersionSchema,
    createdUtcMs: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    habits: z.number().int().min(0).max(100),
    bytes: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const backupReplySchema = z
  .object({
    code: z.enum([
      'saved',
      'inspected',
      'restored',
      'uncertain',
      'canceled',
      'busy',
      'invalid',
      'error',
    ]),
    summary: backupSummarySchema.nullable(),
    token: z.string().uuid().nullable(),
    rescue: z.boolean().optional(),
  })
  .strict();
export type BackupSummary = z.infer<typeof backupSummarySchema>;
export type BackupReply = z.infer<typeof backupReplySchema>;
export const restoreRequestSchema = z
  .object({
    token: z.string().uuid(),
    confirmReplacement: z.literal(true),
    rescue: z.literal(true).optional(),
  })
  .strict();
export interface BackupAPI {
  export: () => Promise<BackupReply>;
  inspect: () => Promise<BackupReply>;
  cancel: () => Promise<void>;
  restore: (input: z.infer<typeof restoreRequestSchema>) => Promise<BackupReply>;
}
