import { z } from 'zod';
export const maintenanceActionSchema = z.enum(['status', 'open-backups', 'export-csv']);
export const maintenanceStatusSchema = z
  .object({ lastBackupUtcMs: z.number().nullable(), error: z.string().nullable() })
  .strict();
export interface MaintenanceAPI {
  status: () => Promise<z.infer<typeof maintenanceStatusSchema>>;
  openBackups: () => Promise<void>;
  exportCSV: () => Promise<'saved' | 'canceled' | 'busy'>;
}
