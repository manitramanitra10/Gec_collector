"use server"

import { z } from "zod"
import { getSessionProfile } from "@/lib/auth0"
import {
  castVote,
  claimNextToCorrect,
  createExample,
  getStats,
  listBatches,
  listErrorTypes,
  listPendingExamples,
  rejectCorrection,
  skipCorrection,
  submitCorrection,
} from "@/lib/examples"
import { logActivity } from "@/lib/activity"
import { getUserActivityExport } from "@/lib/dashboard"
import { grantAccess, hasAccess, revokeAccess, verifyCode } from "@/lib/secrets"
import { findUserById, updateUserNames, upsertUserFromAuth0 } from "@/lib/users"
import type { Batch, ErrorType, Example, SecretType, Stats, User, UserActivityExport } from "@/lib/types"

// Server actions : seules portes d'entrée des pages client vers la base de données.
// Elles renvoient des objets de résultat plutôt que de lever des erreurs, car
// Next.js masque les messages d'erreur des server actions en production.
//
// proxy.ts redirige déjà toute requête sans session ; requireUser() est une seconde
// barrière, et c'est elle qui crée ou rafraîchit la ligne `users` de l'appelant.

const LOGIN_REQUIRED = "Connexion requise."
const ACCOUNT_DISABLED = "Ce compte est désactivé."
const VALIDATION_CODE_REQUIRED = "Code de validation requis."

type UserCheck = { user: User } | { user: null; error: string }

async function requireUser(): Promise<UserCheck> {
  const profile = await getSessionProfile()
  if (!profile) return { user: null, error: LOGIN_REQUIRED }
  const user = await upsertUserFromAuth0(profile)
  if (!user) return { user: null, error: ACCOUNT_DISABLED }
  return { user }
}

/** Ne garde que les codes présents dans le référentiel, sans doublon. */
async function sanitizeErrorTypes(codes: string[]): Promise<string[]> {
  const known = new Set((await listErrorTypes()).map((t) => t.code))
  return [...new Set(codes.map((c) => c.trim()).filter((c) => known.has(c)))]
}

function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

// ---------------------------------------------------------------------------
// Référentiels
// ---------------------------------------------------------------------------

export async function fetchErrorTypes(): Promise<ErrorType[]> {
  const check = await requireUser()
  if (!check.user) throw new Error(check.error)
  return listErrorTypes()
}

export async function fetchBatches(): Promise<Batch[]> {
  const check = await requireUser()
  if (!check.user) throw new Error(check.error)
  return listBatches()
}

// ---------------------------------------------------------------------------
// Soumission directe
// ---------------------------------------------------------------------------

const submitSchema = z.object({
  incorrectText: z.string().trim().min(1),
  correctText: z.string().trim().min(1),
  tags: z.string().default(""),
  source: z.string().default(""),
  errorTypes: z.array(z.string()).default([]),
})

export type SubmitResult = { ok: true } | { ok: false; error: string }

export async function submitExample(input: z.input<typeof submitSchema>): Promise<SubmitResult> {
  const check = await requireUser()
  if (!check.user) return { ok: false, error: check.error }

  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Les deux champs de texte sont obligatoires." }
  }

  const { incorrectText, correctText, tags, source, errorTypes } = parsed.data
  try {
    await createExample({
      incorrect_text: incorrectText,
      correct_text: correctText,
      tags: parseTags(tags),
      source: source.trim() || null,
      error_types: await sanitizeErrorTypes(errorTypes),
      created_by: check.user.id,
    })
    return { ok: true }
  } catch (err) {
    console.error("submitExample :", err)
    return { ok: false, error: "Impossible d'enregistrer l'exemple. Vérifiez la connexion à la base de données." }
  }
}

// ---------------------------------------------------------------------------
// Validation par votes
// ---------------------------------------------------------------------------

const pageSchema = z.object({ page: z.number().int().min(1).default(1) })

export type PendingPage = Awaited<ReturnType<typeof listPendingExamples>>

/** File de validation paginée (10 par page). Exige le code de validation (cookie serveur). */
export async function fetchPendingExamples(input: z.input<typeof pageSchema> = {}): Promise<PendingPage> {
  const check = await requireUser()
  if (!check.user) throw new Error(check.error)
  if (!(await hasAccess("validate"))) throw new Error(VALIDATION_CODE_REQUIRED)
  const { page } = pageSchema.parse(input)
  return listPendingExamples(page, 10)
}

const voteSchema = z.object({
  exampleId: z.string().uuid(),
  vote: z.union([z.literal(1), z.literal(-1)]),
})

export type VoteActionResult =
  | { outcome: "recorded"; example: Example }
  | { outcome: "duplicate" }
  | { outcome: "not_found" }
  | { outcome: "error"; error: string }

export async function voteOnExample(input: z.input<typeof voteSchema>): Promise<VoteActionResult> {
  const check = await requireUser()
  if (!check.user) return { outcome: "error", error: check.error }
  if (!(await hasAccess("validate"))) return { outcome: "error", error: VALIDATION_CODE_REQUIRED }

  const parsed = voteSchema.safeParse(input)
  if (!parsed.success) {
    return { outcome: "error", error: "Vote invalide." }
  }

  try {
    return await castVote(parsed.data.exampleId, check.user.id, parsed.data.vote)
  } catch (err) {
    console.error("voteOnExample :", err)
    return { outcome: "error", error: "Impossible d'enregistrer le vote." }
  }
}

// ---------------------------------------------------------------------------
// Correction des exemples importés
// ---------------------------------------------------------------------------

const batchFilterSchema = z.object({ batchId: z.string().uuid().nullable() })

export type ClaimActionResult =
  | { ok: true; example: Example | null; remaining: number }
  | { ok: false; error: string }

/** Réserve et renvoie le prochain exemple à lisser, dans le lot demandé ou tous lots confondus. */
export async function claimNextExample(input: z.input<typeof batchFilterSchema>): Promise<ClaimActionResult> {
  const check = await requireUser()
  if (!check.user) return { ok: false, error: check.error }

  const parsed = batchFilterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Lot invalide." }

  try {
    const result = await claimNextToCorrect(check.user.id, parsed.data.batchId)
    return { ok: true, ...result }
  } catch (err) {
    console.error("claimNextExample :", err)
    return { ok: false, error: "Impossible de charger le prochain exemple." }
  }
}

const correctionSchema = z.object({
  exampleId: z.string().uuid(),
  incorrectText: z.string().trim().min(1),
  correctText: z.string().trim().min(1),
  tags: z.string().default(""),
  source: z.string().default(""),
  errorTypes: z.array(z.string()).default([]),
})

export type CorrectionActionResult =
  | { outcome: "done" }
  | { outcome: "not_found" }
  | { outcome: "locked" }
  | { outcome: "error"; error: string }

export async function correctExample(input: z.input<typeof correctionSchema>): Promise<CorrectionActionResult> {
  const check = await requireUser()
  if (!check.user) return { outcome: "error", error: check.error }

  const parsed = correctionSchema.safeParse(input)
  if (!parsed.success) return { outcome: "error", error: "Les deux champs de texte sont obligatoires." }

  const { exampleId, incorrectText, correctText, tags, source, errorTypes } = parsed.data
  try {
    const result = await submitCorrection(exampleId, check.user.id, {
      incorrect_text: incorrectText,
      correct_text: correctText,
      tags: parseTags(tags),
      source: source.trim() || null,
      error_types: await sanitizeErrorTypes(errorTypes),
    })
    return result.outcome === "done" ? { outcome: "done" } : { outcome: result.outcome }
  } catch (err) {
    console.error("correctExample :", err)
    return { outcome: "error", error: "Impossible d'enregistrer le lissage." }
  }
}

const exampleIdSchema = z.object({ exampleId: z.string().uuid() })

export async function skipExample(input: z.input<typeof exampleIdSchema>): Promise<{ ok: boolean }> {
  const check = await requireUser()
  if (!check.user) return { ok: false }
  const parsed = exampleIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  try {
    return { ok: await skipCorrection(parsed.data.exampleId, check.user.id) }
  } catch (err) {
    console.error("skipExample :", err)
    return { ok: false }
  }
}

export async function rejectExample(input: z.input<typeof exampleIdSchema>): Promise<CorrectionActionResult> {
  const check = await requireUser()
  if (!check.user) return { outcome: "error", error: check.error }
  const parsed = exampleIdSchema.safeParse(input)
  if (!parsed.success) return { outcome: "error", error: "Exemple invalide." }
  try {
    const result = await rejectCorrection(parsed.data.exampleId, check.user.id)
    return result.outcome === "done" ? { outcome: "done" } : { outcome: result.outcome }
  } catch (err) {
    console.error("rejectExample :", err)
    return { outcome: "error", error: "Impossible de rejeter l'exemple." }
  }
}

// ---------------------------------------------------------------------------
// Export : statistiques seules ; le téléchargement passe par /api/export (flux).
// ---------------------------------------------------------------------------

export async function fetchExportStats(): Promise<Stats> {
  const check = await requireUser()
  if (!check.user) throw new Error(check.error)
  return getStats()
}

// ---------------------------------------------------------------------------
// Codes d'accès vérifiés côté serveur contre la table secrets
// ---------------------------------------------------------------------------

const unlockSchema = z.object({ code: z.string().min(1).max(200) })

export type UnlockResult = { ok: true } | { ok: false; error: string }

const UNLOCK_ACTIONS = {
  validate: "validate.unlock",
  export: "export.unlock",
  supervision: "supervision.unlock",
} as const

async function unlockWithCode(type: SecretType, input: z.input<typeof unlockSchema>): Promise<UnlockResult> {
  const check = await requireUser()
  if (!check.user) return { ok: false, error: check.error }

  const parsed = unlockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Saisissez le code." }

  try {
    const ok = await verifyCode(type, parsed.data.code)
    // Tentatives réussies et refusées sont journalisées ; le code lui-même ne l'est jamais.
    await logActivity({
      actorId: check.user.id,
      action: UNLOCK_ACTIONS[type],
      entityType: "secret",
      details: { ok },
    })
    if (!ok) return { ok: false, error: "Code incorrect." }
    await grantAccess(type, parsed.data.code)
    return { ok: true }
  } catch (err) {
    console.error(`unlock ${type} :`, err)
    return { ok: false, error: "Impossible de vérifier le code." }
  }
}

export async function unlockValidation(input: z.input<typeof unlockSchema>): Promise<UnlockResult> {
  return unlockWithCode("validate", input)
}

export async function unlockExport(input: z.input<typeof unlockSchema>): Promise<UnlockResult> {
  return unlockWithCode("export", input)
}

export async function unlockSupervision(input: z.input<typeof unlockSchema>): Promise<UnlockResult> {
  return unlockWithCode("supervision", input)
}

export async function lockSupervision(): Promise<{ ok: boolean }> {
  await revokeAccess("supervision")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Export de l'activité d'un utilisateur (bouton « Télécharger l'activité »)
// ---------------------------------------------------------------------------

const activityExportSchema = z.object({ userId: z.string().uuid().optional() })

export type ActivityExportResult = { ok: true; data: UserActivityExport } | { ok: false; error: string }

/**
 * Sans `userId` : l'activité de l'appelant. Avec `userId` : celle d'un autre
 * utilisateur, réservé aux détenteurs du code de supervision.
 */
export async function fetchUserActivityExport(
  input: z.input<typeof activityExportSchema> = {},
): Promise<ActivityExportResult> {
  const check = await requireUser()
  if (!check.user) return { ok: false, error: check.error }

  const parsed = activityExportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Utilisateur invalide." }

  try {
    let target: User | null = check.user
    if (parsed.data.userId && parsed.data.userId !== check.user.id) {
      if (!(await hasAccess("supervision"))) return { ok: false, error: "Accès de supervision requis." }
      target = await findUserById(parsed.data.userId)
      if (!target) return { ok: false, error: "Utilisateur introuvable." }
    }

    const data = await getUserActivityExport(target)
    await logActivity({
      actorId: check.user.id,
      action: "activity.export",
      entityType: "user",
      entityId: target.id,
      details: {
        self: target.id === check.user.id,
        contributions: data.contributions.length,
        activity_rows: data.activity.length,
      },
    })
    return { ok: true, data }
  } catch (err) {
    console.error("fetchUserActivityExport :", err)
    return { ok: false, error: "Impossible de récupérer l'activité." }
  }
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
})

export type ProfileResult = { ok: true; firstName: string; lastName: string } | { ok: false; error: string }

/** Page « Mon compte » : prénom et nom, facultatifs (chaîne vide pour effacer). */
export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ProfileResult> {
  const check = await requireUser()
  if (!check.user) return { ok: false, error: check.error }

  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Prénom et nom ne peuvent pas dépasser 80 caractères." }
  }

  try {
    const updated = await updateUserNames(
      check.user.id,
      parsed.data.firstName || null,
      parsed.data.lastName || null,
    )
    if (!updated) return { ok: false, error: ACCOUNT_DISABLED }
    return { ok: true, firstName: updated.first_name ?? "", lastName: updated.last_name ?? "" }
  } catch (err) {
    console.error("updateProfile :", err)
    return { ok: false, error: "Impossible d'enregistrer le profil." }
  }
}
