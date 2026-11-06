// Prépare la base PostgreSQL locale :
//   1. crée la base nommée dans DATABASE_URL si elle n'existe pas ;
//   2. applique scripts/001_create_tables.sql ;
//   3. avec --seed, insère les données de démonstration de scripts/002_seed.sql.
//
// Usage : yarn db:setup   |   yarn db:seed

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"
import pg from "pg"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

// Même ordre de priorité que Next.js : .env.local l'emporte sur .env.
loadEnv({ path: [join(root, ".env.local"), join(root, ".env")], quiet: true })

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
if (!url) {
  console.error("DATABASE_URL manquante : copiez .env.example vers .env.local et renseignez la connexion.")
  process.exit(1)
}

// Même logique SSL que lib/db.ts : en clair en local, chiffré sans vérification ailleurs.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
function sslConfig(connectionString) {
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
const ssl = sslConfig(url)

const target = new URL(url)
const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""))
if (!dbName) {
  console.error("DATABASE_URL doit se terminer par le nom de la base, ex. postgresql://postgres:pw@localhost:5432/gec_collector")
  process.exit(1)
}

const withSeed = process.argv.includes("--seed")
const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`

try {
  // 1. Création de la base via la base d'administration "postgres".
  const adminUrl = new URL(url)
  adminUrl.pathname = "/postgres"
  const admin = new pg.Client({ connectionString: adminUrl.toString(), ssl })
  await admin.connect()
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName])
  if (rowCount === 0) {
    await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`)
    console.log(`Base "${dbName}" créée.`)
  } else {
    console.log(`Base "${dbName}" déjà présente.`)
  }
  await admin.end()

  // 2. Schéma (+ 3. données de démo).
  const db = new pg.Client({ connectionString: url, ssl })
  await db.connect()
  await db.query(readFileSync(join(here, "001_create_tables.sql"), "utf8"))
  console.log("Schéma appliqué (tables examples, votes et index).")
  if (withSeed) {
    await db.query(readFileSync(join(here, "002_seed.sql"), "utf8"))
    const { rows } = await db.query("SELECT count(*)::int AS n FROM examples")
    console.log(`Données de démonstration : ${rows[0].n} exemple(s) en base.`)
  }
  await db.end()
} catch (err) {
  console.error("Échec de la préparation de la base :", err.message ?? err)
  if (err.code === "28P01") console.error("Mot de passe refusé : vérifiez DATABASE_URL dans .env.local.")
  if (err.code === "ECONNREFUSED") console.error("Connexion refusée : le service PostgreSQL est-il démarré ?")
  process.exit(1)
}
