import type { DatabaseSync } from 'node:sqlite';
import { newId, nowIso } from './db.ts';

export function audit(
  db: DatabaseSync,
  input: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): void {
  db.prepare(
    `INSERT INTO audit_records (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.actorUserId,
    input.action,
    input.entityType,
    input.entityId,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    nowIso(),
  );
}
