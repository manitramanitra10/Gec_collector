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

import { readFileSync } from "node:fs"
import { basename } from "node:path"
import pg from "pg"
import { explainPgError, getConnectionString, loadProjectEnv, sslConfig } from "./lib.mjs"

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
  const codes = new Set()
  for (const item of items) {
    for (const code of Array.isArray(item?.error_types) ? item.error_types : []) {
      if (typeof code === "string" && code.trim()) codes.add(code.trim())
    }
  }
  const newCodes = []
  for (const code of codes) {
    const res = await client.query(
      `INSERT INTO error_types (code, label, sort_order, created_by) VALUES ($1, $2, 1000, $3)
       ON CONFLICT (code) DO NOTHING`,
      [code, humanize(code), actor.id],
    )
    if (res.rowCount) newCodes.push(code)
  }

  // Exemples.
  let inserted = 0
  let skipped = 0
  let invalid = 0
  for (const [index, item] of items.entries()) {
    const incorrect = typeof item?.incorrect === "string" ? item.incorrect.trim() : ""
    const correct = typeof item?.correct === "string" ? item.correct.trim() : ""
    if (!incorrect || !correct) {
      invalid++
      console.warn(`Ligne ${index + 1} ignorée : "incorrect" ou "correct" manquant.`)
      continue
    }
    const externalId = String(item.id ?? index)
    const errorTypes = [
      ...new Set(
        (Array.isArray(item.error_types) ? item.error_types : [])
          .filter((c) => typeof c === "string" && c.trim())
          .map((c) => c.trim()),
      ),
    ]
    const tags = Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === "string" && t.trim()) : []
    const source = typeof item.source === "string" && item.source.trim() ? item.source.trim() : null

    const res = await client.query(
      `INSERT INTO examples
         (incorrect_text, correct_text, tags, source, status, origin, batch_id, external_id, error_types, import_payload, created_by)
       VALUES ($1, $2, $3, $4, 'to_correct', $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT (batch_id, external_id) WHERE batch_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING`,
      [incorrect, correct, tags, source, origin, batch.id, externalId, errorTypes, JSON.stringify(item), actor.id],
    )
    res.rowCount ? inserted++ : skipped++
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
