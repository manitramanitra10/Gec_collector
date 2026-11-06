import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { getPool } from "./db"
import type { SecretType } from "./types"

/**
 * Codes d'accès vérifiés côté serveur contre la table `secrets`.
 * Après une saisie correcte, un cookie httpOnly porte un jeton HMAC du code
 * (jamais le code lui-même). À chaque requête, le jeton est recomparé au code
 * actuellement en base : changer le code en base révoque les accès en cours.
 */
const COOKIE_PREFIX = "gec_access_"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12

function signingKey(): string {
  const key = process.env.AUTH0_SECRET
  if (!key) throw new Error("AUTH0_SECRET manquante : nécessaire pour signer les cookies d'accès.")
  return key
}

function tokenFor(code: string): string {
  return createHmac("sha256", signingKey()).update(code).digest("hex")
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

async function getSecretCode(type: SecretType): Promise<string | null> {
  const { rows } = await getPool().query(`SELECT code FROM secrets WHERE type = $1 AND is_delete = false`, [type])
  return rows[0]?.code ?? null
}

/** Vrai si `input` est le code en base pour ce type. */
export async function verifyCode(type: SecretType, input: string): Promise<boolean> {
  const code = await getSecretCode(type)
  return code !== null && safeEqual(code, input)
}

/** Pose le cookie d'accès. À appeler depuis une server action (cookies() en écriture). */
export async function grantAccess(type: SecretType, code: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_PREFIX + type, tokenFor(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
}

export async function revokeAccess(type: SecretType): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_PREFIX + type)
}

/** Vrai si le cookie correspond au code actuellement en base. Utilisable dans un server component. */
export async function hasAccess(type: SecretType): Promise<boolean> {
  const store = await cookies()
  const token = store.get(COOKIE_PREFIX + type)?.value
  if (!token) return false
  const code = await getSecretCode(type)
  return code !== null && safeEqual(token, tokenFor(code))
}
