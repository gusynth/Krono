import type Database from 'better-sqlite3';
import { gardenSnapshotSchema } from '../../shared/contracts/garden';

/** Consulta única e limitada a um agregado; segmentos/datas não são recontados. */
export function readGarden(db: Database.Database) {
  const totals = db
    .prepare(
      "SELECT COALESCE(SUM(eligible_ms),0) AS eligibleMs,COUNT(*) AS sessions FROM focus_sessions WHERE outcome='completed' AND phase IN ('focus','free') AND eligible_ms>0",
    )
    .get() as { eligibleMs: number; sessions: number };
  return gardenSnapshotSchema.parse({ version: 1, ...totals });
}
