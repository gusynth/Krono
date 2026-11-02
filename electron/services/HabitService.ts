import {
  habitsSnapshotSchema,
  habitReplySchema,
  type HabitsSnapshot,
  type HabitReply,
} from '../../shared/contracts/habits';
import { z } from 'zod';

export class HabitService {
  constructor(
    private request: (type: string, value?: unknown) => Promise<unknown>,
    private now = Date.now,
    private timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) {}
  read(): Promise<HabitsSnapshot> {
    return this.request('habits:read', { now: this.now(), timezone: this.timezone }).then((value) =>
      habitsSnapshotSchema.parse(value),
    );
  }
  async command(command: unknown): Promise<HabitReply> {
    try {
      return habitReplySchema.parse(
        await this.request('habits:command', { command, now: this.now(), timezone: this.timezone }),
      );
    } catch {
      return { code: 'storage-error', snapshot: null };
    }
  }
  async selected(): Promise<string | null> {
    return z
      .string()
      .uuid()
      .nullable()
      .parse(await this.request('habits:selected', { now: this.now(), timezone: this.timezone }));
  }
}
