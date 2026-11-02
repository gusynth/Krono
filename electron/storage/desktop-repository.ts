import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  defaultPreferences,
  preferencesSchema,
  preferenceUpdateSchema,
  alertSchema,
  deliverySchema,
  type DesktopPreferences,
  type PreferenceUpdate,
  type CompletionAlert,
  type Delivery,
} from '../../shared/contracts/desktop';

export interface DesktopRepository {
  preferences: () => Promise<DesktopPreferences>;
  update: (update: PreferenceUpdate) => Promise<DesktopPreferences>;
  acknowledgeHide: () => Promise<void>;
  recoverAlerts: () => Promise<void>;
  pending: () => Promise<{ sessionId: string; phase: CompletionAlert['phase'] }[]>;
  claim: (sessionId: string) => Promise<boolean>;
  outcome: (value: { sessionId: string; notification: Delivery; sound: Delivery }) => Promise<void>;
  alerts: () => Promise<{ alerts: CompletionAlert[]; unread: number }>;
  dismiss: (sessionId: string) => Promise<void>;
}
export const outcomeSchema = z
  .object({ sessionId: z.string().uuid(), notification: deliverySchema, sound: deliverySchema })
  .strict();
export function desktopRepository(db: Database.Database) {
  const preferences = () => {
    const row = db.prepare('SELECT payload FROM desktop_preferences WHERE id = 1').get() as
      { payload: string } | undefined;
    return row ? preferencesSchema.parse(JSON.parse(row.payload)) : defaultPreferences();
  };
  const write = (value: DesktopPreferences) => {
    db.prepare(
      'INSERT INTO desktop_preferences(id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
    ).run(JSON.stringify(preferencesSchema.parse(value)));
  };
  const update = (input: unknown) =>
    db.transaction(() => {
      const value = preferenceUpdateSchema.parse(input),
        current = preferences();
      if (current.revision !== value.expectedRevision) throw new Error('PREFERENCE_CONFLICT');
      const next = { ...current, ...value.patch, revision: current.revision + 1 };
      write(next);
      return next;
    })();
  const acknowledgeHide = () =>
    db.transaction(() => {
      const current = preferences();
      if (!current.firstHideSeen)
        write({ ...current, firstHideSeen: true, revision: current.revision + 1 });
    })();
  // 'delivered' é marcador legado de consumo da outbox, não prova de exibição/audição.
  // Os estados observáveis e ambíguos ficam exclusivamente em desktop_alerts.
  const recoverAlerts = () =>
    db.transaction(() => {
      db.prepare(
        "UPDATE desktop_alerts SET notification = 'ambiguous' WHERE notification = 'claimed'",
      ).run();
      db.prepare("UPDATE desktop_alerts SET sound = 'ambiguous' WHERE sound = 'claimed'").run();
      // Alarmes antigos não são repetidos ao reabrir. Aviso interno permanece até dispensar.
      db.exec(
        "INSERT OR IGNORE INTO desktop_alerts(session_id, notification, sound, dismissed) SELECT session_id, 'ambiguous', 'ambiguous', 0 FROM focus_events WHERE delivery = 'pending'; UPDATE focus_events SET delivery = 'delivered' WHERE delivery = 'pending'",
      );
    })();
  const pending = () =>
    db
      .prepare(
        "SELECT e.session_id AS sessionId, s.phase FROM focus_events e JOIN focus_sessions s ON s.id = e.session_id WHERE e.delivery = 'pending' ORDER BY s.completed_utc, s.id LIMIT 20",
      )
      .all() as { sessionId: string; phase: CompletionAlert['phase'] }[];
  const claim = (id: string) =>
    db.transaction(() => {
      z.string().uuid().parse(id);
      const result = db
        .prepare(
          "INSERT OR IGNORE INTO desktop_alerts(session_id, notification, sound, dismissed) SELECT session_id, 'claimed', 'claimed', 0 FROM focus_events WHERE session_id = ? AND delivery = 'pending'",
        )
        .run(id);
      if (result.changes === 0) return false;
      db.prepare("UPDATE focus_events SET delivery = 'delivered' WHERE session_id = ?").run(id);
      return true;
    })();
  const outcome = (input: unknown) => {
    const value = outcomeSchema.parse(input);
    db.prepare('UPDATE desktop_alerts SET notification = ?, sound = ? WHERE session_id = ?').run(
      value.notification,
      value.sound,
      value.sessionId,
    );
  };
  const alerts = () => ({
    alerts: db
      .prepare(
        'SELECT a.session_id AS sessionId, s.phase, a.notification, a.sound FROM desktop_alerts a JOIN focus_sessions s ON s.id = a.session_id WHERE a.dismissed = 0 ORDER BY s.completed_utc DESC, s.id DESC LIMIT 5',
      )
      .all()
      .map((value) => alertSchema.parse(value)),
    unread: (
      db.prepare('SELECT COUNT(*) AS total FROM desktop_alerts WHERE dismissed = 0').get() as {
        total: number;
      }
    ).total,
  });
  const dismiss = (id: string) => {
    z.string().uuid().parse(id);
    db.prepare('UPDATE desktop_alerts SET dismissed = 1 WHERE session_id = ?').run(id);
  };
  return {
    preferences,
    update,
    acknowledgeHide,
    recoverAlerts,
    pending,
    claim,
    outcome,
    alerts,
    dismiss,
  };
}
