"use server"

import { z } from "zod"
import { castVote, createExample, getStats, listExamples, listPendingExamples } from "@/lib/examples"
import type { Example, ExampleFilter, Stats } from "@/lib/types"

// Server actions : seules portes d'entrée des pages client vers la base de données.
// Elles renvoient des objets de résultat plutôt que de lever des erreurs, car
// Next.js masque les messages d'erreur des server actions en production.

const submitSchema = z.object({
  incorrectText: z.string().trim().min(1),
  correctText: z.string().trim().min(1),
  tags: z.string().default(""),
  source: z.string().default(""),
})

export type SubmitResult = { ok: true } | { ok: false; error: string }

export async function submitExample(input: z.input<typeof submitSchema>): Promise<SubmitResult> {
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
  const parsedFilter = filterSchema.parse(filter)
  const [examples, stats] = await Promise.all([listExamples(parsedFilter), getStats()])
  return { examples, stats }
}
