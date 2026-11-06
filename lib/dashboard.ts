import "server-only"
import type { QueryResultRow } from "pg"
import { getPool } from "./db"
import type { DashboardActivity, ExampleStatus, User, UserActivityExport, UserDashboard } from "./types"
import { userDisplayName } from "./users"

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function countsByKey(rows: QueryResultRow[], key: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) out[String(row[key])] = Number(row.n)
  return out
}

/** Tableau de bord personnel : actions faites, devenir des contributions, reste à faire, activité paginée. */
export async function getUserDashboard(userId: string, page = 1, pageSize = 10): Promise<UserDashboard> {
  const pool = getPool()

  const { rows: countRows } = await pool.query(`SELECT count(*) AS n FROM activity_log WHERE created_by = $1`, [
    userId,
  ])
  const total = Number(countRows[0].n)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const offset = (current - 1) * pageSize

  const [actions, outcomes, votes, todo, recent] = await Promise.all([
    pool.query(`SELECT action, count(*) AS n FROM activity_log WHERE created_by = $1 GROUP BY action`, [userId]),

    // Contributions de l'utilisateur : ses saisies directes et les exemples importés qu'il a
    // corrigés. Les exemples qu'il a lui-même rejetés à la correction (aucun vote) sont exclus :
    // ils ne sont pas une contribution à valider.
    pool.query(
      `SELECT status, count(*) AS n FROM examples
       WHERE is_delete = false
         AND ((created_by = $1 AND origin = 'manual') OR (corrected_by = $1 AND status <> 'to_correct'))
         AND NOT (status = 'rejected' AND corrected_by = $1 AND votes_up + votes_down = 0)
       GROUP BY status`,
      [userId],
    ),

    pool.query(`SELECT vote, count(*) AS n FROM votes WHERE created_by = $1 AND is_delete = false GROUP BY vote`, [
      userId,
    ]),

    pool.query(
      `SELECT
         (SELECT count(*) FROM examples WHERE is_delete = false AND status = 'to_correct') AS to_correct,
         (SELECT count(*) FROM examples e
          WHERE e.is_delete = false AND e.status = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM votes v WHERE v.example_id = e.id AND v.created_by = $1 AND v.is_delete = false
            )) AS to_vote`,
      [userId],
    ),

    pool.query(
      `SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details,
              e.incorrect_text, e.status AS example_status, b.name AS batch_name
       FROM activity_log a
       LEFT JOIN examples e ON a.entity_type = 'example' AND e.id = a.entity_id
       LEFT JOIN batches  b ON a.entity_type = 'batch'   AND b.id = a.entity_id
       WHERE a.created_by = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
  ])

  const byAction = countsByKey(actions.rows, "action")
  const byStatus = countsByKey(outcomes.rows, "status")
  const byVote = countsByKey(votes.rows, "vote")

  return {
    actions: {
      submitted: byAction["example.submit"] ?? 0,
      corrected: byAction["example.correct"] ?? 0,
      rejectedAtCorrection: byAction["example.reject"] ?? 0,
      skipped: byAction["example.skip"] ?? 0,
      votes: byAction["example.vote"] ?? 0,
      votesUp: byVote["1"] ?? 0,
      votesDown: byVote["-1"] ?? 0,
      imports: byAction["batch.import"] ?? 0,
    },
    outcomes: {
      to_correct: byStatus.to_correct ?? 0,
      pending: byStatus.pending ?? 0,
      validated: byStatus.validated ?? 0,
      rejected: byStatus.rejected ?? 0,
    },
    todo: {
      toCorrect: Number(todo.rows[0].to_correct),
      toVote: Number(todo.rows[0].to_vote),
    },
    recent: {
      items: recent.rows.map(
        (r): DashboardActivity => ({
          id: r.id,
          created_at: toIso(r.created_at),
          action: r.action,
          entity_type: r.entity_type,
          entity_id: r.entity_id ?? null,
          details: r.details ?? null,
          example_text: r.incorrect_text ?? null,
          example_status: (r.example_status as ExampleStatus | null) ?? null,
          batch_name: r.batch_name ?? null,
        }),
      ),
      total,
      page: current,
      pageSize,
      pageCount,
    },
  }
}

/** Journal complet au-delà duquel l'export est tronqué (les plus récents d'abord). */
const EXPORT_ACTIVITY_LIMIT = 5000

/**
 * Tout ce qu'un utilisateur a fait, prêt à télécharger : résumé, contributions
 * (exemples soumis ou corrigés, avec leur statut actuel) et journal complet.
 */
export async function getUserActivityExport(user: User): Promise<UserActivityExport> {
  const pool = getPool()
  const [dashboard, contributions, activity] = await Promise.all([
    getUserDashboard(user.id, 1, 1),
    pool.query(
      `SELECT e.id, e.status, e.origin, b.name AS batch_name, e.external_id, e.incorrect_text, e.correct_text,
              e.error_types, e.tags, e.votes_up, e.votes_down, e.created_at, e.corrected_at,
              CASE WHEN e.created_by = $1 AND e.origin = 'manual' THEN 'submitted' ELSE 'corrected' END AS role
       FROM examples e
       LEFT JOIN batches b ON b.id = e.batch_id
       WHERE e.is_delete = false
         AND ((e.created_by = $1 AND e.origin = 'manual') OR (e.corrected_by = $1 AND e.status <> 'to_correct'))
       ORDER BY e.created_at DESC`,
      [user.id],
    ),
    pool.query(
      `SELECT created_at, action, entity_type, entity_id, before, after, details
       FROM activity_log WHERE created_by = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [user.id, EXPORT_ACTIVITY_LIMIT],
    ),
  ])

  return {
    generated_at: new Date().toISOString(),
    user: {
      id: user.id,
      name: userDisplayName(user) ?? "Compte",
      email: user.email,
      created_at: user.created_at,
      last_seen_at: user.last_seen_at,
    },
    summary: { ...dashboard.actions, contributions: dashboard.outcomes },
    contributions: contributions.rows.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.status,
      origin: r.origin,
      batch: r.batch_name ?? null,
      external_id: r.external_id ?? null,
      incorrect_text: r.incorrect_text,
      correct_text: r.correct_text,
      error_types: r.error_types ?? [],
      tags: r.tags ?? [],
      votes_up: r.votes_up,
      votes_down: r.votes_down,
      created_at: toIso(r.created_at),
      corrected_at: r.corrected_at ? toIso(r.corrected_at) : null,
    })),
    activity: activity.rows.map((r) => ({
      created_at: toIso(r.created_at),
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
      details: r.details ?? null,
    })),
  }
}
