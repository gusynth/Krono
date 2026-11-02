import type Database from 'better-sqlite3';
/** Somente fixtures temporárias: reconstitui o delta ausente de schema 4 ou anterior. */
export function removeProductionSchema(db: Database.Database) {
  db.exec(`DROP TABLE production_goal_versions; DROP TABLE production_goal_commands; DROP TABLE production_goal_state;
    DROP INDEX focus_completion_date; DROP INDEX focus_habit_date; DROP INDEX focus_habit_history;
    ALTER TABLE focus_sessions DROP COLUMN completion_date; ALTER TABLE focus_sessions DROP COLUMN habit_id;
    DELETE FROM schema_migrations WHERE version=5;`);
}
