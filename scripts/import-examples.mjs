// Importe un fichier JSON de paires synthétiques (ou collectées sur le web) dans un lot.
// Les exemples arrivent avec le statut « to_correct » et passent par la page Corriger
// avant la validation.
//
// Usage :
//   yarn import:examples <fichier.json> --batch <nom-du-lot> [--origin synthetic|web]
//                        [--note "description"] [--user <email>]
//
// Format attendu : un tableau d'objets { id, incorrect, correct, error_types?, tags?, source? }
// (voir scripts/samples/synthetic-sample.json). Rejouable : un exemple déjà importé
// (même lot, même id) est ignoré. Les codes d'erreur inconnus sont ajoutés au référentiel.
// --user désigne l'utilisateur au nom duquel l'import est journalisé ; facultatif s'il
// n'y a qu'un seul compte en base.
//
// Les lignes sont insérées par lots de BATCH_SIZE dans une seule transaction : rien
// n'est écrit si une erreur survient, et un fichier de 170 000 lignes passe en quelques
// minutes même sur une base distante.

import { readFileSync } from "node:fs"
import { basename } from "node:path"
import pg from "pg"
import { explainPgError, getConnectionString, loadProjectEnv, sslConfig } from "./lib.mjs"

/** Lignes par INSERT (10 paramètres par ligne, limite PostgreSQL : 65 535 paramètres). */
const BATCH_SIZE = 1000

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) {
      args[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true
    } else {
      args._.push(a)
    }
  }
  return args
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** « MOT_INCONNU » → « Mot inconnu » : libellé provisoire d'un code absent du référentiel. */
function humanize(code) {
  const text = code.replace(/_/g, " ").toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const args = parseArgs(process.argv.slice(2))
const file = args._[0]
if (!file || typeof args.batch !== "string" || !args.batch.trim()) {
  fail("Usage : yarn import:examples <fichier.json> --batch <nom-du-lot> [--origin synthetic|web] [--note \"…\"] [--user <email>]")
}
const batchName = args.batch.trim()
const origin = typeof args.origin === "string" ? args.origin : "synthetic"
if (!["synthetic", "web"].includes(origin)) fail(`--origin doit valoir synthetic ou web (reçu : ${origin}).`)
const note = typeof args.note === "string" ? args.note : null

let items
try {
  items = JSON.parse(readFileSync(file, "utf8"))
} catch (err) {
  fail(`Impossible de lire ${file} : ${err.message}`)
}
if (!Array.isArray(items)) {
  fail("Le fichier doit contenir un tableau JSON d'objets { id, incorrect, correct, error_types }.")
}

// Validation et préparation des lignes avant toute écriture.
const rows = []
let invalid = 0
const codes = new Set()
for (const [index, item] of items.entries()) {
  const incorrect = typeof item?.incorrect === "string" ? item.incorrect.trim() : ""
  const correct = typeof item?.correct === "string" ? item.correct.trim() : ""
  if (!incorrect || !correct) {
    invalid++
    if (invalid <= 20) console.warn(`Ligne ${index + 1} ignorée : "incorrect" ou "correct" manquant.`)
    continue
  }
  const errorTypes = [
    ...new Set(
      (Array.isArray(item.error_types) ? item.error_types : [])
        .filter((c) => typeof c === "string" && c.trim())
        .map((c) => c.trim()),
    ),
  ]
  for (const c of errorTypes) codes.add(c)
  const tags = Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === "string" && t.trim()) : []
  const source = typeof item.source === "string" && item.source.trim() ? item.source.trim() : null
  rows.push({ incorrect, correct, tags, source, externalId: String(item.id ?? index), errorTypes, payload: JSON.stringify(item) })
}
if (invalid > 20) console.warn(`… et ${invalid - 20} autre(s) ligne(s) invalide(s).`)
console.log(`${rows.length} ligne(s) valide(s) sur ${items.length}, ${codes.size} type(s) d'erreur distinct(s).`)

loadProjectEnv()
const url = getConnectionString()
const client = new pg.Client({ connectionString: url, ssl: sslConfig(url) })

try {
  await client.connect()

  // Utilisateur au nom duquel l'import est tracé.
  let actor
  if (typeof args.user === "string") {
    actor = (await client.query("SELECT id, email FROM users WHERE email = $1 AND is_delete = false", [args.user])).rows[0]
    if (!actor) fail(`Aucun compte actif avec l'e-mail ${args.user}.`)
  } else {
    const users = (await client.query("SELECT id, email FROM users WHERE is_delete = false ORDER BY created_at")).rows
    if (users.length === 1) actor = users[0]
    else if (users.length === 0) fail("Aucun compte en base : connectez-vous une fois à l'application avant d'importer.")
    else fail(`Plusieurs comptes en base, précisez --user parmi : ${users.map((u) => u.email).join(", ")}`)
  }

  await client.query("BEGIN")

  // Lot (créé ou réutilisé).
  const batch = (
    await client.query(
      `INSERT INTO batches (name, origin, note, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET note = COALESCE(EXCLUDED.note, batches.note)
       WHERE batches.is_delete = false
       RETURNING id, origin, (xmax = 0) AS inserted`,
      [batchName, origin, note, actor.id],
    )
  ).rows[0]
  if (!batch) fail(`Le lot "${batchName}" existe mais est supprimé logiquement.`)
  if (batch.origin !== origin) {
    await client.query("ROLLBACK")
    fail(`Le lot "${batchName}" existe déjà avec l'origine "${batch.origin}", pas "${origin}".`)
  }

  // Types d'erreur inconnus → ajoutés au référentiel.
  const newCodes = []
  for (const code of codes) {
    const res = await client.query(
      `INSERT INTO error_types (code, label, sort_order, created_by) VALUES ($1, $2, 1000, $3)
       ON CONFLICT (code) DO NOTHING`,
      [code, humanize(code), actor.id],
    )
    if (res.rowCount) newCodes.push(code)
  }

  // Exemples, par lots de BATCH_SIZE lignes.
  let inserted = 0
  let skipped = 0
  const started = Date.now()
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + BATCH_SIZE)
    const params = []
    const values = chunk.map((r, k) => {
      const b = k * 10
      params.push(r.incorrect, r.correct, r.tags, r.source, origin, batch.id, r.externalId, r.errorTypes, r.payload, actor.id)
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, 'to_correct', $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}::jsonb, $${b + 10})`
    })
    const res = await client.query(
      `INSERT INTO examples
         (incorrect_text, correct_text, tags, source, status, origin, batch_id, external_id, error_types, import_payload, created_by)
       VALUES ${values.join(", ")}
       ON CONFLICT (batch_id, external_id) WHERE batch_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING`,
      params,
    )
    inserted += res.rowCount
    skipped += chunk.length - res.rowCount
    const done = Math.min(offset + BATCH_SIZE, rows.length)
    if (done === rows.length || (offset / BATCH_SIZE) % 10 === 9) {
      const seconds = Math.round((Date.now() - started) / 1000)
      console.log(`  ${done} / ${rows.length} lignes traitées (${seconds} s)`)
    }
  }

  // Journal.
  await client.query(
    `INSERT INTO activity_log (created_by, action, entity_type, entity_id, details)
     VALUES ($1, 'batch.import', 'batch', $2, $3::jsonb)`,
    [
      actor.id,
      batch.id,
      JSON.stringify({
        file: basename(file),
        batch: batchName,
        origin,
        total: items.length,
        inserted,
        skipped,
        invalid,
        new_error_types: newCodes,
      }),
    ],
  )

  await client.query("COMMIT")
  console.log(`Lot "${batchName}" (${origin}) ${batch.inserted ? "créé" : "réutilisé"}, import tracé pour ${actor.email}.`)
  console.log(`Exemples : ${inserted} importé(s), ${skipped} déjà présent(s), ${invalid} invalide(s) sur ${items.length}.`)
  if (newCodes.length) console.log(`Types d'erreur ajoutés au référentiel : ${newCodes.join(", ")} (libellés à ajuster en base).`)
} catch (err) {
  await client.query("ROLLBACK").catch(() => {})
  console.error("Échec de l'import, rien n'a été écrit.")
  explainPgError(err)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
