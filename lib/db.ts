import "server-only"
import { Pool, type PoolConfig } from "pg"

// Le pool est mis en cache sur globalThis pour survivre au rechargement à chaud
// de Next.js en développement (sinon chaque recompilation ouvrirait un nouveau pool).
const globalForPg = globalThis as unknown as { __gecPool?: Pool }

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function isLocalHost(connectionString: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(connectionString).hostname)
  } catch {
    return false
  }
}

/**
 * Chiffrement de la connexion, piloté par DATABASE_SSL :
 *  - "disable"     : en clair. Défaut quand l'hôte est local.
 *  - "require"     : chiffré, certificat serveur non vérifié. Défaut pour un hôte distant.
 *                    C'est le mode qui fonctionne avec Supabase, dont le certificat est
 *                    signé par sa propre autorité.
 *  - "verify-full" : chiffré et certificat vérifié. Fournir l'autorité (PEM) dans
 *                    DATABASE_SSL_CA, sinon les autorités système sont utilisées.
 * Ne pas mettre `sslmode=` dans DATABASE_URL : pg le ferait primer sur ce réglage.
 */
function sslConfig(connectionString: string): PoolConfig["ssl"] {
  const mode = process.env.DATABASE_SSL ?? (isLocalHost(connectionString) ? "disable" : "require")
  switch (mode) {
    case "disable":
      return false
    case "require":
      return { rejectUnauthorized: false }
    case "verify-full":
      return process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA, rejectUnauthorized: true } : true
    default:
      throw new Error(`DATABASE_SSL invalide : "${mode}" (valeurs acceptées : disable, require, verify-full).`)
  }
}

export function getPool(): Pool {
  if (globalForPg.__gecPool) return globalForPg.__gecPool

  // POSTGRES_URL est la variable posée automatiquement par l'intégration Supabase ↔ Vercel.
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL manquante : copiez .env.example vers .env.local et renseignez la connexion PostgreSQL.",
    )
  }

  const pool = new Pool({ connectionString, ssl: sslConfig(connectionString) })
  globalForPg.__gecPool = pool
  return pool
}
