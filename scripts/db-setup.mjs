// Prépare la base PostgreSQL :
//   1. crée la base nommée dans DATABASE_URL si elle n'existe pas ;
//   2. applique scripts/001_create_tables.sql (idempotent, met aussi à niveau une base existante) ;
//   3. avec --seed, insère les données de démonstration de scripts/002_seed.sql.
//
// Usage : yarn db:setup   |   yarn db:seed

import { readFileSync } from "node:fs"
import { join } from "node:path"
import pg from "pg"
import { explainPgError, getConnectionString, loadProjectEnv, scriptsDir, sslConfig } from "./lib.mjs"

loadProjectEnv()
const url = getConnectionString()
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
  await db.query(readFileSync(join(scriptsDir, "001_create_tables.sql"), "utf8"))
  console.log("Schéma appliqué (tables users, batches, error_types, examples, votes, secrets, activity_log et index).")
  if (withSeed) {
    await db.query(readFileSync(join(scriptsDir, "002_seed.sql"), "utf8"))
    const { rows } = await db.query("SELECT count(*)::int AS n FROM examples")
    console.log(`Données de démonstration : ${rows[0].n} exemple(s) en base.`)
  }
  await db.end()
} catch (err) {
  console.error("Échec de la préparation de la base.")
  explainPgError(err)
  process.exit(1)
}
