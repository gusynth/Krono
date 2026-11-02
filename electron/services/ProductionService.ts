import {
  productionDaySchema,
  type ProductionDayQuery,
  productionHistoryPageSchema,
  goalsSnapshotSchema,
  productionSnapshotSchema,
  goalReplySchema,
  type GoalReply,
  type ProductionQuery,
} from '../../shared/contracts/production';
import { gardenSnapshotSchema } from '../../shared/contracts/garden';

export class ProductionService {
  private listeners = new Set<() => void>();
  garden() {
    return this.request('production:garden').then((value) => gardenSnapshotSchema.parse(value));
  }
  constructor(
    private request: (type: string, value?: unknown) => Promise<unknown>,
    private now = Date.now,
    private timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) {}
  day(query: ProductionDayQuery) {
    return this.request('production:day', { query, now: this.now(), timezone: this.timezone }).then(
      (value) => productionDaySchema.parse(value),
    );
  }
  read(query: ProductionQuery) {
    return this.request('production:read', {
      query,
      now: this.now(),
      timezone: this.timezone,
    }).then((value) => productionSnapshotSchema.parse(value));
  }
  history(query: ProductionQuery) {
    return this.request('production:history', {
      query,
      now: this.now(),
      timezone: this.timezone,
    }).then((value) => productionHistoryPageSchema.parse(value));
  }
  goals() {
    return this.request('production:goals', { now: this.now(), timezone: this.timezone }).then(
      (value) => goalsSnapshotSchema.parse(value),
    );
  }
  async command(command: unknown): Promise<GoalReply> {
    try {
      const reply = goalReplySchema.parse(
        await this.request('production:command', {
          command,
          now: this.now(),
          timezone: this.timezone,
        }),
      );
      if (reply.code === 'ok') for (const listener of this.listeners) listener();
      return reply;
    } catch {
      return { code: 'storage-error', revision: null };
    }
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
