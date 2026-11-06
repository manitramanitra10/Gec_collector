import "server-only"
import type { QueryResultRow } from "pg"
import { getPool } from "./db"
import type { Example, ExampleFilter, Stats } from "./types"

/** Nombre de votes positifs requis pour passer un exemple en `validated`. */
export const VALIDATE_THRESHOLD = 1
/** Nombre de votes négatifs requis pour passer un exemple en `rejected`. */
export const REJECT_THRESHOLD = 1

const EXAMPLE_COLUMNS =
  "id, incorrect_text, correct_text, tags, source, status, votes_up, votes_down, created_at"

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
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

function isPgError(err: unknown): err is { code?: string } {
  return typeof err === "object" && err !== null && "code" in err
}

export interface NewExample {
  incorrect_text: string
  correct_text: string
  tags: string[]
  source: string | null
}

export async function createExample(input: NewExample): Promise<Example> {
  const { rows } = await getPool().query(
    `INSERT INTO examples (incorrect_text, correct_text, tags, source)
     VALUES ($1, $2, $3, $4)
     RETURNING ${EXAMPLE_COLUMNS}`,
    [input.incorrect_text, input.correct_text, input.tags, input.source],
  )
  return toExample(rows[0])
}

export async function listPendingExamples(limit = 20): Promise<Example[]> {
  const { rows } = await getPool().query(
    `SELECT ${EXAMPLE_COLUMNS}
     FROM examples
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  )
  return rows.map(toExample)
}

export async function listExamples(filter: ExampleFilter): Promise<Example[]> {
  const where = filter === "all" ? "" : "WHERE status = $1"
  const params = filter === "all" ? [] : [filter]
  const { rows } = await getPool().query(
    `SELECT ${EXAMPLE_COLUMNS} FROM examples ${where} ORDER BY created_at DESC`,
    params,
  )
  return rows.map(toExample)
}

export async function getStats(): Promise<Stats> {
  const { rows } = await getPool().query(`
    SELECT
      (SELECT count(*) FROM examples)                            AS total,
      (SELECT count(*) FROM examples WHERE status = 'validated') AS validated,
      (SELECT count(*) FROM examples WHERE status = 'pending')   AS pending,
      (SELECT count(*) FROM examples WHERE status = 'rejected')  AS rejected,
      (SELECT count(*) FROM votes)                               AS total_votes,
      (SELECT coalesce(sum(votes_up), 0) FROM examples)          AS total_votes_up,
      (SELECT coalesce(sum(votes_down), 0) FROM examples)        AS total_votes_down
  `)
  const r = rows[0]
  // count() et sum() renvoient des bigint, que pg sérialise en chaînes.
  return {
    total: Number(r.total),
    validated: Number(r.validated),
    pending: Number(r.pending),
    rejected: Number(r.rejected),
    totalVotes: Number(r.total_votes),
    totalVotesUp: Number(r.total_votes_up),
    totalVotesDown: Number(r.total_votes_down),
  }
}

export type VoteResult =
  | { outcome: "recorded"; example: Example }
  | { outcome: "duplicate" }
  | { outcome: "not_found" }

/**
 * Enregistre un vote et met à jour les compteurs et le statut de l'exemple
 * dans une seule transaction. L'incrément se fait côté SQL, donc deux votes
 * simultanés ne peuvent pas s'écraser.
 */
export async function castVote(exampleId: string, voterHash: string, vote: 1 | -1): Promise<VoteResult> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")

    // La contrainte UNIQUE(example_id, voter_hash) lève 23505 en cas de doublon,
    // la clé étrangère lève 23503 si l'exemple n'existe pas.
    await client.query(`INSERT INTO votes (example_id, voter_hash, vote) VALUES ($1, $2, $3)`, [
      exampleId,
      voterHash,
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
       WHERE id = $1
       RETURNING ${EXAMPLE_COLUMNS}`,
      [exampleId, up, down, VALIDATE_THRESHOLD, REJECT_THRESHOLD],
    )

    await client.query("COMMIT")
    return { outcome: "recorded", example: toExample(rows[0]) }
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
