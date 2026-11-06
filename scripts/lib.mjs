// Fonctions partagées par les scripts Node du dossier scripts/.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"

export const scriptsDir = dirname(fileURLToPath(import.meta.url))
export const rootDir = join(scriptsDir, "..")

/** Même ordre de priorité que Next.js : .env.local l'emporte sur .env. */
export function loadProjectEnv() {
  loadEnv({ path: [join(rootDir, ".env.local"), join(rootDir, ".env")], quiet: true })
}

/** Lit DATABASE_URL (ou POSTGRES_URL) et explique les erreurs de forme les plus courantes. */
export function getConnectionString() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) {
    console.error("DATABASE_URL manquante : copiez .env.example vers .env.local et renseignez la connexion.")
    process.exit(1)
  }

  const placeholder = url.match(/<[^>]+>|\[YOUR-PASSWORD\]/)
  if (placeholder) {
    console.error(`DATABASE_URL contient encore un espace réservé : ${placeholder[0]}`)
    console.error("Copiez la chaîne complète depuis Supabase (bouton Connect > URI > Transaction pooler) et remplacez-le.")
    process.exit(1)
  }

  try {
    new URL(url)
  } catch {
    console.error("DATABASE_URL n'est pas une URL valide.")
    console.error("Si le mot de passe contient des caractères spéciaux, encodez-les :")
    console.error("  @ -> %40   & -> %26   ? -> %3F   * -> %2A   # -> %23   / -> %2F   : -> %3A   espace -> %20")
    console.error('Exemple : node -e "console.log(encodeURIComponent(\'mot de passe\'))" donne la forme encodée.')
    process.exit(1)
  }

  return url
}

// Même logique SSL que lib/db.ts : en clair en local, chiffré sans vérification ailleurs.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export function sslConfig(connectionString) {
  let local = false
  try {
    local = LOCAL_HOSTS.has(new URL(connectionString).hostname)
  } catch {}
  const mode = process.env.DATABASE_SSL ?? (local ? "disable" : "require")
  if (mode === "disable") return false
  if (mode === "require") return { rejectUnauthorized: false }
  if (mode === "verify-full") {
    return process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA, rejectUnauthorized: true } : true
  }
  console.error(`DATABASE_SSL invalide : "${mode}" (valeurs acceptées : disable, require, verify-full).`)
  process.exit(1)
}

/** Messages d'aide pour les erreurs de connexion les plus courantes. */
export function explainPgError(err) {
  console.error("Erreur :", err.message ?? err)
  if (err.code === "28P01") console.error("Mot de passe refusé : vérifiez DATABASE_URL dans .env.local.")
  if (err.code === "ECONNREFUSED") console.error("Connexion refusée : le service PostgreSQL est-il démarré ?")
}
