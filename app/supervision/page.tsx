import Link from "next/link"
import { redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { RefreshButton } from "@/components/activity-export-button"
import { StatTile } from "@/components/user-dashboard-view"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSessionProfile } from "@/lib/auth0"
import { hasAccess } from "@/lib/secrets"
import { getSupervisionOverview } from "@/lib/supervision"
import type { Batch } from "@/lib/types"
import { ArrowRight, Database, PencilLine, ThumbsDown, ThumbsUp, Users } from "lucide-react"
import { LockButton, UnlockForm } from "./unlock-form"

const ORIGIN_LABELS: Record<Batch["origin"], string> = { synthetic: "Synthétique", web: "Web" }

function BatchProgress({ batch }: { batch: Batch }) {
  const total = batch.counts.to_correct + batch.counts.pending + batch.counts.validated + batch.counts.rejected
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  const treated = total - batch.counts.to_correct
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground">{batch.name}</p>
          <Badge variant="outline" className="text-[11px]">
            {ORIGIN_LABELS[batch.origin]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {treated} / {total} traité{treated > 1 ? "s" : ""} ({total ? Math.round(pct(treated)) : 0} %)
        </p>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-success" style={{ width: `${pct(batch.counts.validated)}%` }} />
        <div className="bg-amber-500" style={{ width: `${pct(batch.counts.pending)}%` }} />
        <div className="bg-destructive" style={{ width: `${pct(batch.counts.rejected)}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {batch.counts.validated} validé(s) · {batch.counts.pending} en attente · {batch.counts.rejected} rejeté(s) ·{" "}
        {batch.counts.to_correct} à lisser
      </p>
    </div>
  )
}

export default async function SupervisionPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect("/auth/login?returnTo=/supervision")

  if (!(await hasAccess("supervision"))) {
    return <UnlockForm />
  }

  const overview = await getSupervisionOverview()

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-5xl px-6 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Suivi des contributeurs</h1>
            <p className="text-muted-foreground">Évolution du corpus et activité de chaque utilisateur.</p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton />
            <LockButton />
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Corpus</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile value={overview.usersCount} label="Utilisateurs" icon={<Users className="h-5 w-5 text-primary" />} />
            <StatTile value={overview.stats.total} label="Exemples" icon={<Database className="h-5 w-5 text-muted-foreground" />} />
            <StatTile value={overview.stats.toCorrect} label="À lisser" icon={<PencilLine className="h-5 w-5 text-primary" />} />
            <StatTile value={overview.stats.pending} label="En attente" icon={<div className="h-3 w-3 rounded-full bg-amber-500" />} />
            <StatTile value={overview.stats.validated} label="Validés" icon={<ThumbsUp className="h-5 w-5 text-success" />} />
            <StatTile value={overview.stats.rejected} label="Rejetés" icon={<ThumbsDown className="h-5 w-5 text-destructive" />} />
          </div>
        </section>

        {overview.batches.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Progression des lots</h2>
            <Card className="border-border/50">
              <CardContent className="space-y-6 px-4 pt-5 sm:px-6 sm:pt-6">
                {overview.batches.map((batch) => (
                  <BatchProgress key={batch.id} batch={batch} />
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Par utilisateur</h2>
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {overview.users.length} compte{overview.users.length > 1 ? "s" : ""}, du plus actif récemment au moins actif
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium sm:px-6">Utilisateur</th>
                      <th className="px-3 py-3 text-right font-medium">Soumis</th>
                      <th className="px-3 py-3 text-right font-medium">Lissés</th>
                      <th className="px-3 py-3 text-right font-medium">Votes</th>
                      <th className="px-3 py-3 text-right font-medium">Contributions</th>
                      <th className="px-3 py-3 font-medium">Dernière activité</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {overview.users.map((u) => {
                      const initials = u.name
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                      return (
                        <tr key={u.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 sm:px-6">
                            <div className="flex items-center gap-3">
                              <Avatar className="size-8 text-xs">
                                {u.picture_url && <AvatarImage src={u.picture_url} alt="" referrerPolicy="no-referrer" />}
                                <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials || "?"}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{u.name}</p>
                                {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{u.submitted}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {u.corrected}
                            {u.skipped > 0 && <span className="text-xs text-muted-foreground"> (+{u.skipped} passés)</span>}
                            {u.rejectedAtCorrection > 0 && (
                              <span className="text-xs text-destructive"> ({u.rejectedAtCorrection} rejetés)</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className="text-success">{u.votesUp}</span> / <span className="text-destructive">{u.votesDown}</span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className="text-success">{u.contributions.validated}</span> /{" "}
                            <span className="text-amber-600">{u.contributions.pending}</span> /{" "}
                            <span className="text-destructive">{u.contributions.rejected}</span>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {u.last_activity_at
                              ? formatDistanceToNow(new Date(u.last_activity_at), { addSuffix: true, locale: fr })
                              : "aucune"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button asChild variant="ghost" size="sm" className="gap-1 text-primary hover:text-primary/80">
                              <Link href={`/supervision/${u.id}`}>
                                Détail
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-[11px] text-muted-foreground sm:px-6">
                Votes : positifs / négatifs. Contributions : validées / en attente / rejetées, hors rejets faits par
                l'utilisateur lui-même au lissage.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
