import { open, rename, rm, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import type { ProductionService } from './ProductionService';
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
export class HistoryExport {
  private busy = false;
  constructor(
    private production: ProductionService,
    private root: string,
    private choose: () => Promise<string | null>,
  ) {}
  async export() {
    if (this.busy) return 'busy' as const;
    this.busy = true;
    let temporary: string | null = null;
    try {
      const destination = await this.choose();
      if (!destination) return 'canceled' as const;
      const parent = await realpath(dirname(destination)),
        root = await realpath(this.root),
        rel = relative(root, join(parent, basename(destination)));
      if (
        !destination.toLowerCase().endsWith('.csv') ||
        !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      )
        throw new Error('INVALID_EXPORT_DESTINATION');
      temporary = join(parent, `.krono-${randomUUID()}.tmp`);
      const file = await open(temporary, 'wx');
      try {
        await file.write(
          '\uFEFFData;Fuso;Tipo;Resultado;Hábito;Tempo ativo (s);Foco concluído (s)\r\n',
        );
        let page = await this.production.history({ days: 365, habitId: null });
        const endDate = page.endDate,
          ceiling = page.ceiling;
        let pages = 0;
        while (true) {
          if (++pages > 400) throw new Error('EXPORT_LIMIT');
          for (const session of page.history)
            await file.write(
              [
                session.completionDate,
                session.timezone,
                session.phase === 'free' ? 'Livre' : 'Foco',
                session.outcome === 'completed' ? 'Concluído' : 'Interrompido',
                session.habitName,
                session.activeMs / 1000,
                session.eligibleMs / 1000,
              ]
                .map(csvCell)
                .join(';') + '\r\n',
            );
          if (!page.nextCursor) break;
          page = await this.production.history({
            days: 365,
            habitId: null,
            endDate,
            ceiling,
            cursor: page.nextCursor,
          });
        }
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, destination);
      temporary = null;
      return 'saved' as const;
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
      this.busy = false;
    }
  }
}
