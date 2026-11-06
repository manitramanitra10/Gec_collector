import "server-only"
import { getPool } from "./db"
import { getStats, listBatches } from "./examples"
import type { SupervisionOverview, UserProgress } from "./types"

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * Vue d'ensemble de la route de suivi : totaux, progression des lots et, pour
 * chaque utilisateur, ce qu'il a fait (journal) et le devenir de ses contributions.
 * Même définition de « contribution » que le tableau de bord personnel.
 */
export async function getSupervisionOverview(): Promise<SupervisionOverview> {
  const pool = getPool()
  const [stats, batches, usersResult] = await Promise.all([
    getStats(),
    listBatches(),
    pool.query(`
      WITH contributions AS (
        SELECT e.id, e.status,
               CASE WHEN e.created_by IS NOT NULL AND e.origin = 'manual' THEN e.created_by ELSE e.corrected_by END AS user_id
        FROM examples e
        WHERE e.is_delete = false
          AND e.status <> 'to_correct'
          AND NOT (e.status = 'rejected' AND e.corrected_by IS NOT NULL AND e.votes_up + e.votes_down = 0)
      )
      SELECT u.id, u.email, u.display_name, u.first_name, u.last_name, u.picture_url, u.last_seen_at,
             (SELECT count(*) FROM activity_log a WHERE a.created_by = u.id AND a.action = 'example.submit')  AS submitted,
             (SELECT count(*) FROM activity_log a WHERE a.created_by = u.id AND a.action = 'example.correct') AS corrected,
             (SELECT count(*) FROM activity_log a WHERE a.created_by = u.id AND a.action = 'example.skip')    AS skipped,
             (SELECT count(*) FROM activity_log a WHERE a.created_by = u.id AND a.action = 'example.reject')  AS rejected_at_correction,
             (SELECT count(*) FROM votes v WHERE v.created_by = u.id AND v.is_delete = false AND v.vote = 1)  AS votes_up,
             (SELECT count(*) FROM votes v WHERE v.created_by = u.id AND v.is_delete = false AND v.vote = -1) AS votes_down,
             (SELECT count(*) FROM contributions c WHERE c.user_id = u.id AND c.status = 'validated') AS c_validated,
             (SELECT count(*) FROM contributions c WHERE c.user_id = u.id AND c.status = 'pending')   AS c_pending,
             (SELECT count(*) FROM contributions c WHERE c.user_id = u.id AND c.status = 'rejected')  AS c_rejected,
             (SELECT max(a.created_at) FROM activity_log a WHERE a.created_by = u.id) AS last_activity_at
      FROM users u
      WHERE u.is_delete = false
      ORDER BY last_activity_at DESC NULLS LAST, u.created_at`),
  ])

  const users: UserProgress[] = usersResult.rows.map((r) => {
    const chosen = [r.first_name, r.last_name].filter((p: string | null) => p && p.trim()).join(" ")
    return {
      id: r.id,
      name: chosen || r.display_name || r.email || "Compte",
      email: r.email ?? null,
      picture_url: r.picture_url ?? null,
      last_seen_at: toIsoOrNull(r.last_seen_at),
      last_activity_at: toIsoOrNull(r.last_activity_at),
      submitted: Number(r.submitted),
      corrected: Number(r.corrected),
      skipped: Number(r.skipped),
      rejectedAtCorrection: Number(r.rejected_at_correction),
      votesUp: Number(r.votes_up),
      votesDown: Number(r.votes_down),
      contributions: {
        validated: Number(r.c_validated),
        pending: Number(r.c_pending),
        rejected: Number(r.c_rejected),
      },
    }
  })

  return { usersCount: users.length, stats, batches, users }
}
