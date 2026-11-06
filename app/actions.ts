"use server"

import { z } from "zod"
import { auth0 } from "@/lib/auth0"
import { castVote, createExample, getStats, listExamples, listPendingExamples } from "@/lib/examples"
import type { Example, ExampleFilter, Stats } from "@/lib/types"

// Server actions : seules portes d'entrée des pages client vers la base de données.
// Elles renvoient des objets de résultat plutôt que de lever des erreurs, car
// Next.js masque les messages d'erreur des server actions en production.
//
// proxy.ts redirige déjà toute requête sans session ; la vérification ci-dessous
// est une seconde barrière au cas où une action serait appelée hors de ce chemin.

const LOGIN_REQUIRED = "Connexion requise."

async function hasSession(): Promise<boolean> {
  return (await auth0.getSession()) !== null
}

const submitSchema = z.object({
  incorrectText: z.string().trim().min(1),
  correctText: z.string().trim().min(1),
  tags: z.string().default(""),
  source: z.string().default(""),
})

export type SubmitResult = { ok: true } | { ok: false; error: string }

export async function submitExample(input: z.input<typeof submitSchema>): Promise<SubmitResult> {
  if (!(await hasSession())) return { ok: false, error: LOGIN_REQUIRED }

  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Les deux champs de texte sont obligatoires." }
  }

  const { incorrectText, correctText, tags, source } = parsed.data
  try {
    await createExample({
      incorrect_text: incorrectText,
      correct_text: correctText,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      source: source.trim() || null,
    })
    return { ok: true }
  } catch (err) {
    console.error("submitExample :", err)
    return { ok: false, error: "Impossible d'enregistrer l'exemple. Vérifiez la connexion à la base de données." }
  }
}

export async function fetchPendingExamples(): Promise<Example[]> {
  if (!(await hasSession())) throw new Error(LOGIN_REQUIRED)
  return listPendingExamples(20)
}

const voteSchema = z.object({
  exampleId: z.string().uuid(),
  voterHash: z.string().min(1).max(128),
  vote: z.union([z.literal(1), z.literal(-1)]),
})

export type VoteActionResult =
  | { outcome: "recorded"; example: Example }
  | { outcome: "duplicate" }
  | { outcome: "not_found" }
  | { outcome: "error"; error: string }

export async function voteOnExample(input: z.input<typeof voteSchema>): Promise<VoteActionResult> {
  if (!(await hasSession())) return { outcome: "error", error: LOGIN_REQUIRED }

  const parsed = voteSchema.safeParse(input)
  if (!parsed.success) {
    return { outcome: "error", error: "Vote invalide." }
  }

  try {
    return await castVote(parsed.data.exampleId, parsed.data.voterHash, parsed.data.vote)
  } catch (err) {
    console.error("voteOnExample :", err)
    return { outcome: "error", error: "Impossible d'enregistrer le vote." }
  }
}

const filterSchema = z.enum(["all", "pending", "validated", "rejected"])

export async function fetchExportData(filter: ExampleFilter): Promise<{ examples: Example[]; stats: Stats }> {
  if (!(await hasSession())) throw new Error(LOGIN_REQUIRED)
  const parsedFilter = filterSchema.parse(filter)
  const [examples, stats] = await Promise.all([listExamples(parsedFilter), getStats()])
  return { examples, stats }
}
