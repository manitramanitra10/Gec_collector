import "server-only"
import type { QueryResultRow } from "pg"
import { logActivity } from "./activity"
import { getPool } from "./db"
import type { Auth0Profile, User } from "./types"

const USER_COLUMNS =
  "id, auth0_sub, email, display_name, picture_url, first_name, last_name, last_seen_at, " +
  "is_delete, created_at, deleted_at, created_by, deleted_by"

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function toUser(row: QueryResultRow): User {
  return {
    id: row.id,
    auth0_sub: row.auth0_sub,
    email: row.email ?? null,
    display_name: row.display_name ?? null,
    picture_url: row.picture_url ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    last_seen_at: toIsoOrNull(row.last_seen_at),
    is_delete: row.is_delete,
    created_at: toIsoOrNull(row.created_at) ?? "",
    deleted_at: toIsoOrNull(row.deleted_at),
    created_by: row.created_by ?? null,
    deleted_by: row.deleted_by ?? null,
  }
}

/**
 * Crée le compte à la première action de l'utilisateur, puis rafraîchit à chaque
 * appel ce que Google fournit (e-mail, nom affiché, photo) et last_seen_at.
 * first_name et last_name, saisis par l'utilisateur, ne sont jamais écrasés.
 * La création est journalisée (`user.create`), pas les rafraîchissements.
 * Renvoie null si le compte est désactivé (is_delete = true) : l'UPDATE est
 * alors ignoré et RETURNING ne renvoie rien.
 */
export async function upsertUserFromAuth0(profile: Auth0Profile): Promise<User | null> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    // xmax = 0 distingue une ligne insérée d'une ligne mise à jour par ON CONFLICT.
    const { rows } = await client.query(
      `INSERT INTO users (auth0_sub, email, display_name, picture_url, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (auth0_sub) DO UPDATE SET
         email        = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         picture_url  = EXCLUDED.picture_url,
         last_seen_at = NOW()
       WHERE users.is_delete = false
       RETURNING ${USER_COLUMNS}, (xmax = 0) AS inserted`,
      [profile.sub, profile.email, profile.name, profile.picture],
    )
    if (!rows[0]) {
      await client.query("ROLLBACK")
      return null
    }
    const user = toUser(rows[0])
    if (rows[0].inserted) {
      await logActivity(
        {
          actorId: user.id,
          action: "user.create",
          entityType: "user",
          entityId: user.id,
          after: { email: user.email, display_name: user.display_name, auth0_sub: user.auth0_sub },
        },
        client,
      )
    }
    await client.query("COMMIT")
    return user
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await getPool().query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND is_delete = false`, [
    id,
  ])
  return rows[0] ? toUser(rows[0]) : null
}

export async function findUserBySub(sub: string): Promise<User | null> {
  const { rows } = await getPool().query(
    `SELECT ${USER_COLUMNS} FROM users WHERE auth0_sub = $1 AND is_delete = false`,
    [sub],
  )
  return rows[0] ? toUser(rows[0]) : null
}

/**
 * Met à jour prénom et nom (null pour effacer) et journalise l'ancien et le
 * nouveau état (`user.update_profile`). Renvoie null si le compte est désactivé.
 */
export async function updateUserNames(
  id: string,
  firstName: string | null,
  lastName: string | null,
): Promise<User | null> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const before = await client.query(
      `SELECT first_name, last_name FROM users WHERE id = $1 AND is_delete = false FOR UPDATE`,
      [id],
    )
    if (before.rows.length === 0) {
      await client.query("ROLLBACK")
      return null
    }
    const { rows } = await client.query(
      `UPDATE users SET first_name = $2, last_name = $3 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [id, firstName, lastName],
    )
    const user = toUser(rows[0])
    await logActivity(
      {
        actorId: id,
        action: "user.update_profile",
        entityType: "user",
        entityId: id,
        before: { first_name: before.rows[0].first_name, last_name: before.rows[0].last_name },
        after: { first_name: user.first_name, last_name: user.last_name },
      },
      client,
    )
    await client.query("COMMIT")
    return user
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Nom à afficher : prénom et nom s'ils sont renseignés, sinon le nom Google, sinon l'e-mail. */
export function userDisplayName(user: User): string | null {
  const chosen = [user.first_name, user.last_name].filter((p) => p && p.trim()).join(" ")
  return chosen || user.display_name || user.email
}
