import "server-only"
import type { QueryResult } from "pg"
import { getPool } from "./db"

/**
 * Journal d'activité : chaque action d'un utilisateur est enregistrée avec son id
 * (`created_by`), dans la même transaction que l'action quand il y en a une.
 * Ajouter ici toute nouvelle action avant de l'implémenter.
 * `batch.import` est écrit par scripts/import-examples.mjs.
 */
export type ActivityAction =
  | "user.create"
  | "user.update_profile"
  | "example.submit"
  | "example.vote"
  | "example.delete"
  | "example.correct"
  | "example.skip"
  | "example.reject"
  | "batch.import"
  | "supervision.unlock"
  | "activity.export"

export type ActivityEntityType = "user" | "example" | "vote" | "batch" | "secret"

export interface ActivityEntry {
  /** users.id de l'utilisateur qui agit. */
  actorId: string
  action: ActivityAction
  entityType: ActivityEntityType
  entityId?: string | null
  /** État avant l'action (omis à la création). */
  before?: unknown
  /** État après l'action. */
  after?: unknown
  /** Complément libre : sens du vote, nombre de lignes touchées… */
  details?: unknown
}

/** Le minimum commun à Pool et PoolClient, pour journaliser dans une transaction ou hors transaction. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<QueryResult>
}

function toJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

export async function logActivity(entry: ActivityEntry, db: Queryable = getPool()): Promise<void> {
  await db.query(
    `INSERT INTO activity_log (created_by, action, entity_type, entity_id, before, after, details)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
    [
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      toJson(entry.before),
      toJson(entry.after),
      toJson(entry.details),
    ],
  )
}
