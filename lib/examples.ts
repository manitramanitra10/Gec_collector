import "server-only"
import type { PoolClient, QueryResultRow } from "pg"
import { logActivity, type Queryable } from "./activity"
import { getPool } from "./db"
import type { Batch, ErrorType, Example, ExampleFilter, ExampleStatus, Stats } from "./types"

/** Nombre de votes positifs requis pour passer un exemple en `validated`. */
export const VALIDATE_THRESHOLD = 1
/** Nombre de votes négatifs requis pour passer un exemple en `rejected`. */
export const REJECT_THRESHOLD = 1
/** Durée pendant laquelle un exemple ouvert en correction est réservé à son correcteur. */
export const LOCK_MINUTES = 10

// Toutes les requêtes filtrent sur is_delete = false : une ligne supprimée
// logiquement n'est jamais lue, comptée ni modifiée.
const EXAMPLE_SELECT = `
  SELECT e.id, e.incorrect_text, e.correct_text, e.tags, e.source, e.status, e.votes_up, e.votes_down,
         e.origin, e.batch_id, b.name AS batch_name, e.external_id, e.error_types,
         e.corrected_by, e.corrected_at, e.locked_by, e.locked_at,
         e.is_delete, e.created_at, e.deleted_at, e.created_by, e.deleted_by
  FROM examples e
  LEFT JOIN batches b ON b.id = e.batch_id`

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function toIsoOrNull(value: unknown): string | null {
  return value == null ? null : toIso(value)
}

function toExample(row: QueryResultRow): Example {
  return {
    id: row.id,
    incorrect_text: row.incorrect_text,
    correct_text: row.correct_text,
    tags: row.tags ?? [],
    source: row.source ?? null,
    status: row.status,
    votes_up: row.votes_up,
    votes_down: row.votes_down,
    origin: row.origin ?? "manual",
    batch_id: row.batch_id ?? null,
    batch_name: row.batch_name ?? null,
    external_id: row.external_id ?? null,
    error_types: row.error_types ?? [],
    corrected_by: row.corrected_by ?? null,
    corrected_at: toIsoOrNull(row.corrected_at),
    locked_by: row.locked_by ?? null,
    locked_at: toIsoOrNull(row.locked_at),
    is_delete: row.is_delete,
    created_at: toIso(row.created_at),
    deleted_at: toIsoOrNull(row.deleted_at),
    created_by: row.created_by ?? null,
    deleted_by: row.deleted_by ?? null,
  }
}

function isPgError(err: unknown): err is { code?: string } {
  return typeof err === "object" && err !== null && "code" in err
}

async function fetchExampleById(db: Queryable, id: string): Promise<Example | null> {
  const { rows } = await db.query(`${EXAMPLE_SELECT} WHERE e.id = $1`, [id])
  return rows[0] ? toExample(rows[0]) : null
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Référentiels
// ---------------------------------------------------------------------------

export async function listErrorTypes(): Promise<ErrorType[]> {
  const { rows } = await getPool().query(
    `SELECT code, label, sort_order, is_delete, created_at, deleted_at, created_by, deleted_by
     FROM error_types WHERE is_delete = false ORDER BY sort_order, code`,
  )
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    sort_order: r.sort_order,
    is_delete: r.is_delete,
    created_at: toIso(r.created_at),
    deleted_at: toIsoOrNull(r.deleted_at),
    created_by: r.created_by ?? null,
    deleted_by: r.deleted_by ?? null,
  }))
}

/** Lots actifs, du plus récent au plus ancien, avec le nombre d'exemples actifs par statut. */
export async function listBatches(): Promise<Batch[]> {
  const { rows } = await getPool().query(`
    SELECT b.id, b.name, b.origin, b.note, b.is_delete, b.created_at, b.deleted_at, b.created_by, b.deleted_by,
           count(e.id) FILTER (WHERE e.status = 'to_correct') AS to_correct,
           count(e.id) FILTER (WHERE e.status = 'pending')    AS pending,
           count(e.id) FILTER (WHERE e.status = 'validated')  AS validated,
           count(e.id) FILTER (WHERE e.status = 'rejected')   AS rejected
    FROM batches b
    LEFT JOIN examples e ON e.batch_id = b.id AND e.is_delete = false
    WHERE b.is_delete = false
    GROUP BY b.id
    ORDER BY b.created_at DESC`)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    origin: r.origin,
    note: r.note ?? null,
    counts: {
      to_correct: Number(r.to_correct),
      pending: Number(r.pending),
      validated: Number(r.validated),
      rejected: Number(r.rejected),
    },
    is_delete: r.is_delete,
    created_at: toIso(r.created_at),
    deleted_at: toIsoOrNull(r.deleted_at),
    created_by: r.created_by ?? null,
    deleted_by: r.deleted_by ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Soumission directe
// ---------------------------------------------------------------------------

export interface NewExample {
  incorrect_text: string
  correct_text: string
  tags: string[]
  source: string | null
  error_types: string[]
  /** users.id de l'auteur. */
  created_by: string
}

export async function createExample(input: NewExample): Promise<Example> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO examples (incorrect_text, correct_text, tags, source, error_types, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.incorrect_text, input.correct_text, input.tags, input.source, input.error_types, input.created_by],
    )
    const example = (await fetchExampleById(client, rows[0].id)) as Example
    await logActivity(
      {
        actorId: input.created_by,
        action: "example.submit",
        entityType: "example",
        entityId: example.id,
        after: {
          incorrect_text: example.incorrect_text,
          correct_text: example.correct_text,
          tags: example.tags,
          source: example.source,
          error_types: example.error_types,
          status: example.status,
        },
      },
      client,
    )
    return example
  })
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/** Ramène `page` dans [1, pageCount] et calcule l'offset. */
function paginate(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  return { pageCount, current, offset: (current - 1) * pageSize }
}

/** File de validation, du plus récent au plus ancien, paginée côté serveur. */
export async function listPendingExamples(page = 1, pageSize = 10): Promise<Page<Example>> {
  const pool = getPool()
  const { rows: countRows } = await pool.query(
    `SELECT count(*) AS n FROM examples WHERE is_delete = false AND status = 'pending'`,
  )
  const total = Number(countRows[0].n)
  const { pageCount, current, offset } = paginate(total, page, pageSize)
  const { rows } = await pool.query(
    `${EXAMPLE_SELECT}
     WHERE e.is_delete = false AND e.status = 'pending'
     ORDER BY e.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  )
  return { items: rows.map(toExample), total, page: current, pageSize, pageCount }
}

export async function listExamples(filter: ExampleFilter): Promise<Example[]> {
  const { rows } = await getPool().query(
    `${EXAMPLE_SELECT}
     WHERE e.is_delete = false ${filter === "all" ? "" : "AND e.status = $1"}
     ORDER BY e.created_at DESC`,
    filter === "all" ? [] : [filter],
  )
  return rows.map(toExample)
}

export async function getStats(): Promise<Stats> {
  const { rows } = await getPool().query(`
    SELECT
      (SELECT count(*) FROM examples WHERE is_delete = false)                           AS total,
      (SELECT count(*) FROM examples WHERE is_delete = false AND status = 'to_correct') AS to_correct,
      (SELECT count(*) FROM examples WHERE is_delete = false AND status = 'validated')  AS validated,
      (SELECT count(*) FROM examples WHERE is_delete = false AND status = 'pending')    AS pending,
      (SELECT count(*) FROM examples WHERE is_delete = false AND status = 'rejected')   AS rejected,
      (SELECT count(*) FROM votes WHERE is_delete = false)                              AS total_votes,
      (SELECT coalesce(sum(votes_up), 0) FROM examples WHERE is_delete = false)         AS total_votes_up,
      (SELECT coalesce(sum(votes_down), 0) FROM examples WHERE is_delete = false)       AS total_votes_down
  `)
  const r = rows[0]
  // count() et sum() renvoient des bigint, que pg sérialise en chaînes.
  return {
    total: Number(r.total),
    toCorrect: Number(r.to_correct),
    validated: Number(r.validated),
    pending: Number(r.pending),
    rejected: Number(r.rejected),
    totalVotes: Number(r.total_votes),
    totalVotesUp: Number(r.total_votes_up),
    totalVotesDown: Number(r.total_votes_down),
  }
}

// ---------------------------------------------------------------------------
// Validation par votes
// ---------------------------------------------------------------------------

export type VoteResult =
  | { outcome: "recorded"; example: Example }
  | { outcome: "duplicate" }
  | { outcome: "not_found" }

/**
 * Enregistre le vote de l'utilisateur `userId` et met à jour les compteurs et le
 * statut de l'exemple dans une seule transaction. L'incrément se fait côté SQL,
 * donc deux votes simultanés ne peuvent pas s'écraser. Un exemple supprimé
 * logiquement ou qui n'est pas en attente est traité comme introuvable.
 */
export async function castVote(exampleId: string, userId: string, vote: 1 | -1): Promise<VoteResult> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")

    // L'index unique (example_id, created_by) lève 23505 en cas de doublon,
    // la clé étrangère lève 23503 si l'exemple n'existe pas.
    await client.query(`INSERT INTO votes (example_id, created_by, vote) VALUES ($1, $2, $3)`, [
      exampleId,
      userId,
      vote,
    ])

    const up = vote === 1 ? 1 : 0
    const down = vote === -1 ? 1 : 0
    const { rows } = await client.query(
      `UPDATE examples SET
         votes_up   = votes_up + $2,
         votes_down = votes_down + $3,
         status = CASE
           WHEN votes_down + $3 >= $5 THEN 'rejected'
           WHEN votes_up + $2 >= $4 THEN 'validated'
           ELSE status
         END
       WHERE id = $1 AND is_delete = false AND status = 'pending'
       RETURNING id`,
      [exampleId, up, down, VALIDATE_THRESHOLD, REJECT_THRESHOLD],
    )

    if (rows.length === 0) {
      // Exemple supprimé ou plus en attente : on annule aussi l'insertion du vote.
      await client.query("ROLLBACK")
      return { outcome: "not_found" }
    }

    const example = (await fetchExampleById(client, exampleId)) as Example
    await logActivity(
      {
        actorId: userId,
        action: "example.vote",
        entityType: "example",
        entityId: exampleId,
        before: { votes_up: example.votes_up - up, votes_down: example.votes_down - down },
        after: { votes_up: example.votes_up, votes_down: example.votes_down, status: example.status },
        details: { vote },
      },
      client,
    )

    await client.query("COMMIT")
    return { outcome: "recorded", example }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    if (isPgError(err)) {
      if (err.code === "23505") return { outcome: "duplicate" }
      if (err.code === "23503") return { outcome: "not_found" }
    }
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Correction des exemples importés (status = to_correct)
// ---------------------------------------------------------------------------

export interface ClaimResult {
  example: Example | null
  /** Exemples encore à corriger (dans le lot demandé, ou en tout). */
  remaining: number
}

async function countToCorrect(db: Queryable, batchId: string | null): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*) AS n FROM examples
     WHERE is_delete = false AND status = 'to_correct' AND ($1::uuid IS NULL OR batch_id = $1)`,
    [batchId],
  )
  return Number(rows[0].n)
}

/**
 * Réserve pour `userId` le prochain exemple à corriger (le plus ancien non réservé,
 * les réservations expirant après LOCK_MINUTES) et le renvoie. Un exemple passé
 * reste réservé jusqu'à l'expiration, il ne revient donc pas immédiatement.
 */
export async function claimNextToCorrect(userId: string, batchId: string | null): Promise<ClaimResult> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `WITH next AS (
         SELECT id FROM examples
         WHERE is_delete = false AND status = 'to_correct'
           AND ($2::uuid IS NULL OR batch_id = $2)
           AND (locked_at IS NULL OR locked_at < NOW() - ($3::int * interval '1 minute'))
         ORDER BY created_at, external_id
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE examples SET locked_by = $1, locked_at = NOW()
       FROM next WHERE examples.id = next.id
       RETURNING examples.id`,
      [userId, batchId, LOCK_MINUTES],
    )
    const example = rows[0] ? await fetchExampleById(client, rows[0].id) : null
    const remaining = await countToCorrect(client, batchId)
    return { example, remaining }
  })
}

export interface CorrectionInput {
  incorrect_text: string
  correct_text: string
  tags: string[]
  source: string | null
  error_types: string[]
}

export type CorrectionResult =
  | { outcome: "done"; example: Example }
  | { outcome: "not_found" }
  | { outcome: "locked" }

/** Verrou détenu par quelqu'un d'autre et encore valide. */
function lockedByOther(row: QueryResultRow, userId: string): boolean {
  if (!row.locked_by || row.locked_by === userId || !row.locked_at) return false
  const lockedAt = row.locked_at instanceof Date ? row.locked_at.getTime() : new Date(row.locked_at).getTime()
  return Date.now() - lockedAt < LOCK_MINUTES * 60_000
}

/**
 * Enregistre la correction de `userId` : textes, types d'erreur, tags et source,
 * puis passe l'exemple en `pending` pour la validation. Journalise avant / après.
 */
export async function submitCorrection(
  exampleId: string,
  userId: string,
  input: CorrectionInput,
): Promise<CorrectionResult> {
  return withTransaction(async (client) => {
    const before = await client.query(
      `SELECT incorrect_text, correct_text, tags, source, error_types, locked_by, locked_at
       FROM examples WHERE id = $1 AND is_delete = false AND status = 'to_correct' FOR UPDATE`,
      [exampleId],
    )
    if (before.rows.length === 0) return { outcome: "not_found" as const }
    if (lockedByOther(before.rows[0], userId)) return { outcome: "locked" as const }

    await client.query(
      `UPDATE examples SET
         incorrect_text = $2, correct_text = $3, tags = $4, source = $5, error_types = $6,
         status = 'pending', corrected_by = $7, corrected_at = NOW(), locked_by = NULL, locked_at = NULL
       WHERE id = $1`,
      [exampleId, input.incorrect_text, input.correct_text, input.tags, input.source, input.error_types, userId],
    )
    const example = (await fetchExampleById(client, exampleId)) as Example
    const b = before.rows[0]
    await logActivity(
      {
        actorId: userId,
        action: "example.correct",
        entityType: "example",
        entityId: exampleId,
        before: {
          incorrect_text: b.incorrect_text,
          correct_text: b.correct_text,
          tags: b.tags,
          source: b.source,
          error_types: b.error_types,
          status: "to_correct",
        },
        after: {
          incorrect_text: example.incorrect_text,
          correct_text: example.correct_text,
          tags: example.tags,
          source: example.source,
          error_types: example.error_types,
          status: example.status,
        },
        details: {
          text_changed: b.incorrect_text !== example.incorrect_text || b.correct_text !== example.correct_text,
        },
      },
      client,
    )
    return { outcome: "done" as const, example }
  })
}

/** Le correcteur passe l'exemple : la réservation est prolongée, l'exemple reste à corriger. */
export async function skipCorrection(exampleId: string, userId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE examples SET locked_by = $2, locked_at = NOW()
       WHERE id = $1 AND is_delete = false AND status = 'to_correct'`,
      [exampleId, userId],
    )
    if (!rowCount) return false
    await logActivity({ actorId: userId, action: "example.skip", entityType: "example", entityId: exampleId }, client)
    return true
  })
}

/** Le correcteur juge l'exemple inexploitable : il passe en `rejected` sans validation. */
export async function rejectCorrection(exampleId: string, userId: string): Promise<CorrectionResult> {
  return withTransaction(async (client) => {
    const before = await client.query(
      `SELECT incorrect_text, correct_text, locked_by, locked_at
       FROM examples WHERE id = $1 AND is_delete = false AND status = 'to_correct' FOR UPDATE`,
      [exampleId],
    )
    if (before.rows.length === 0) return { outcome: "not_found" as const }
    if (lockedByOther(before.rows[0], userId)) return { outcome: "locked" as const }

    await client.query(
      `UPDATE examples SET status = 'rejected', corrected_by = $2, corrected_at = NOW(), locked_by = NULL, locked_at = NULL
       WHERE id = $1`,
      [exampleId, userId],
    )
    const example = (await fetchExampleById(client, exampleId)) as Example
    await logActivity(
      {
        actorId: userId,
        action: "example.reject",
        entityType: "example",
        entityId: exampleId,
        before: { status: "to_correct" satisfies ExampleStatus },
        after: { status: example.status },
      },
      client,
    )
    return { outcome: "done" as const, example }
  })
}

// ---------------------------------------------------------------------------
// Suppression logique
// ---------------------------------------------------------------------------

/**
 * Suppression logique d'un exemple et de ses votes par l'utilisateur `deletedBy`,
 * dans une même transaction. Jamais de DELETE physique. Renvoie false si
 * l'exemple n'existe pas ou est déjà supprimé. Aucune page ne l'appelle encore :
 * à exposer derrière une vérification de rôle avant toute utilisation.
 */
export async function softDeleteExample(exampleId: string, deletedBy: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE examples SET is_delete = true, deleted_at = NOW(), deleted_by = $2
       WHERE id = $1 AND is_delete = false
       RETURNING status, votes_up, votes_down`,
      [exampleId, deletedBy],
    )
    if (rows.length === 0) return false
    const { rowCount: votesMarked } = await client.query(
      `UPDATE votes SET is_delete = true, deleted_at = NOW(), deleted_by = $2
       WHERE example_id = $1 AND is_delete = false`,
      [exampleId, deletedBy],
    )
    await logActivity(
      {
        actorId: deletedBy,
        action: "example.delete",
        entityType: "example",
        entityId: exampleId,
        before: { status: rows[0].status, votes_up: rows[0].votes_up, votes_down: rows[0].votes_down, is_delete: false },
        after: { is_delete: true },
        details: { votes_marked: votesMarked ?? 0 },
      },
      client,
    )
    return true
  })
}
