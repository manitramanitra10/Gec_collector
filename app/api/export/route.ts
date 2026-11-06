import { NextResponse, type NextRequest } from "next/server"
import { logActivity } from "@/lib/activity"
import { getSessionProfile } from "@/lib/auth0"
import { iterateExamples } from "@/lib/examples"
import { hasAccess } from "@/lib/secrets"
import { upsertUserFromAuth0 } from "@/lib/users"
import type { Example, ExampleFilter } from "@/lib/types"

// Export du corpus en flux : les lignes partent au fur et à mesure de leur lecture,
// sans jamais charger la liste complète en mémoire ni dans le navigateur.
// Protégé par la session (proxy.ts) et par le code d'export vérifié côté serveur.
export const dynamic = "force-dynamic"
export const maxDuration = 60

const FILTERS = new Set<ExampleFilter>(["all", "to_correct", "pending", "validated", "rejected"])
const CSV_HEADER = "incorrect,correct,error_types,tags,source,status,origin,batch,external_id,votes_up,votes_down"

function toRecord(e: Example) {
  return {
    incorrect: e.incorrect_text,
    correct: e.correct_text,
    error_types: e.error_types,
    tags: e.tags,
    source: e.source,
    status: e.status,
    origin: e.origin,
    batch: e.batch_name,
    external_id: e.external_id,
    votes_up: e.votes_up,
    votes_down: e.votes_down,
  }
}

const csvText = (value: string | null | undefined) => `"${(value ?? "").replace(/"/g, '""')}"`

function toCsvLine(e: Example): string {
  return [
    csvText(e.incorrect_text),
    csvText(e.correct_text),
    csvText(e.error_types.join(", ")),
    csvText(e.tags.join(", ")),
    csvText(e.source),
    csvText(e.status),
    csvText(e.origin),
    csvText(e.batch_name),
    csvText(e.external_id),
    e.votes_up,
    e.votes_down,
  ].join(",")
}

export async function GET(request: NextRequest) {
  const profile = await getSessionProfile()
  if (!profile) return NextResponse.json({ error: "Connexion requise." }, { status: 401 })
  if (!(await hasAccess("export"))) return NextResponse.json({ error: "Code d'export requis." }, { status: 403 })
  const user = await upsertUserFromAuth0(profile)
  if (!user) return NextResponse.json({ error: "Ce compte est désactivé." }, { status: 403 })

  const { searchParams } = request.nextUrl
  const format = searchParams.get("format") === "csv" ? "csv" : "json"
  const filter = (searchParams.get("filter") ?? "validated") as ExampleFilter
  if (!FILTERS.has(filter)) return NextResponse.json({ error: "Filtre invalide." }, { status: 400 })

  await logActivity({
    actorId: user.id,
    action: "export.download",
    entityType: "example",
    details: { format, filter },
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let count = 0
        controller.enqueue(encoder.encode(format === "json" ? "[\n" : CSV_HEADER + "\n"))
        for await (const chunk of iterateExamples(filter, 2000)) {
          const text =
            format === "json"
              ? chunk.map((e) => (count++ === 0 ? "  " : ",\n  ") + JSON.stringify(toRecord(e))).join("")
              : chunk.map(toCsvLine).join("\n") + "\n"
          controller.enqueue(encoder.encode(text))
        }
        if (format === "json") controller.enqueue(encoder.encode("\n]\n"))
        controller.close()
      } catch (err) {
        console.error("export :", err)
        controller.error(err)
      }
    },
  })

  const date = new Date().toISOString().split("T")[0]
  return new Response(stream, {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gec-corpus-${filter}-${date}.${format}"`,
      "Cache-Control": "no-store",
    },
  })
}
