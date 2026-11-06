import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { Pager } from "@/components/pager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardActivity, ExampleStatus, UserDashboard } from "@/lib/types"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  KeyRound,
  PencilLine,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  UserRound,
  XCircle,
} from "lucide-react"

export const STATUS_LABELS: Record<ExampleStatus, string> = {
  to_correct: "À corriger",
  pending: "En attente",
  validated: "Validé",
  rejected: "Rejeté",
}

const STATUS_CLASSES: Record<ExampleStatus, string> = {
  to_correct: "border-primary/30 text-primary",
  pending: "border-amber-500/40 text-amber-600",
  validated: "border-success/40 text-success",
  rejected: "border-destructive/40 text-destructive",
}

/** Libellé et icône d'une action du journal. Toute nouvelle ActivityAction s'ajoute ici. */
function describe(activity: DashboardActivity): { label: string; icon: React.ReactNode } {
  const details = (activity.details ?? {}) as Record<string, unknown>
  switch (activity.action) {
    case "example.submit":
      return { label: "Exemple soumis", icon: <FileText className="h-4 w-4 text-primary" /> }
    case "example.correct":
      return { label: "Exemple corrigé et envoyé en validation", icon: <PencilLine className="h-4 w-4 text-primary" /> }
    case "example.skip":
      return { label: "Exemple passé", icon: <SkipForward className="h-4 w-4 text-muted-foreground" /> }
    case "example.reject":
      return { label: "Exemple rejeté à la correction", icon: <Trash2 className="h-4 w-4 text-destructive" /> }
    case "example.vote":
      return details.vote === 1
        ? { label: "Vote positif", icon: <ThumbsUp className="h-4 w-4 text-success" /> }
        : { label: "Vote négatif", icon: <ThumbsDown className="h-4 w-4 text-destructive" /> }
    case "example.delete":
      return { label: "Exemple supprimé", icon: <Trash2 className="h-4 w-4 text-destructive" /> }
    case "batch.import":
      return {
        label: `Lot importé${activity.batch_name ? ` : ${activity.batch_name}` : ""} (${details.inserted ?? 0} exemples)`,
        icon: <Upload className="h-4 w-4 text-primary" />,
      }
    case "supervision.unlock":
      return details.ok
        ? { label: "Accès à la supervision ouvert", icon: <KeyRound className="h-4 w-4 text-primary" /> }
        : { label: "Code de supervision refusé", icon: <KeyRound className="h-4 w-4 text-destructive" /> }
    case "activity.export":
      return details.self
        ? { label: "Activité téléchargée", icon: <Download className="h-4 w-4 text-muted-foreground" /> }
        : { label: "Activité d'un utilisateur téléchargée (supervision)", icon: <Download className="h-4 w-4 text-primary" /> }
    case "user.create":
      return { label: "Compte créé", icon: <UserRound className="h-4 w-4 text-primary" /> }
    case "user.update_profile":
      return { label: "Profil mis à jour", icon: <UserRound className="h-4 w-4 text-muted-foreground" /> }
    default:
      return { label: activity.action, icon: <History className="h-4 w-4 text-muted-foreground" /> }
  }
}

export function StatTile({
  value,
  label,
  icon,
  hint,
}: {
  value: number
  label: string
  icon: React.ReactNode
  hint?: string
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-3">
          {icon}
          <div className="min-w-0">
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface Props {
  data: UserDashboard
  /** URL d'une page du journal (ex. `/dashboard?page=2#activite`). */
  pagerHref: (page: number) => string
  /** Pronom des titres : « Ce que j'ai fait » ou « Ce qu'il a fait ». */
  perspective?: "self" | "other"
}

/** Sections du tableau de bord d'un utilisateur, partagées par /dashboard et /supervision/[userId]. */
export function UserDashboardView({ data, pagerHref, perspective = "self" }: Props) {
  const self = perspective === "self"
  const contributions = data.outcomes.pending + data.outcomes.validated + data.outcomes.rejected
  const validatedPct = contributions ? Math.round((data.outcomes.validated / contributions) * 100) : 0

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {self ? "Ce que j'ai fait" : "Ce qu'il a fait"}
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile value={data.actions.submitted} label="Exemples soumis" icon={<FileText className="h-5 w-5 text-primary" />} />
          <StatTile
            value={data.actions.corrected}
            label="Exemples corrigés"
            icon={<PencilLine className="h-5 w-5 text-primary" />}
            hint={data.actions.skipped ? `${data.actions.skipped} passé(s)` : undefined}
          />
          <StatTile
            value={data.actions.votes}
            label="Votes"
            icon={<ThumbsUp className="h-5 w-5 text-success" />}
            hint={`${data.actions.votesUp} positif(s), ${data.actions.votesDown} négatif(s)`}
          />
          <StatTile
            value={data.actions.rejectedAtCorrection}
            label="Rejetés à la correction"
            icon={<XCircle className="h-5 w-5 text-destructive" />}
            hint={data.actions.imports ? `${data.actions.imports} lot(s) importé(s)` : undefined}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {self ? "Ce que sont devenues mes contributions" : "Ce que sont devenues ses contributions"}
        </h2>
        <Card className="border-border/50">
          <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6 space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-success">{data.outcomes.validated}</p>
                <p className="text-xs text-muted-foreground">Validés</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{data.outcomes.pending}</p>
                <p className="text-xs text-muted-foreground">En attente</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{data.outcomes.rejected}</p>
                <p className="text-xs text-muted-foreground">Rejetés</p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Taux de validation</span>
                <span>
                  {validatedPct} % de {contributions} contribution{contributions > 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${validatedPct}%` }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Contributions = exemples soumis ou corrigés, hors ceux rejetés par l'utilisateur lui-même à la
              correction.
            </p>
          </CardContent>
        </Card>
      </section>

      {self && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reste à faire</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PencilLine className="h-4 w-4 text-primary" />
                  {data.todo.toCorrect} à corriger
                </CardTitle>
                <CardDescription>Exemples importés en attente de relecture.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="ghost" className="gap-2 px-0 text-primary hover:text-primary/80">
                  <Link href="/correct">
                    Corriger
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {data.todo.toVote} à valider
                </CardTitle>
                <CardDescription>Exemples en attente sur lesquels vous n'avez pas encore voté.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="ghost" className="gap-2 px-0 text-success hover:text-success/80">
                  <Link href="/review">
                    Valider
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <section id="activite" className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {self ? "Mon activité" : "Son activité"}
          </h2>
          {data.recent.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.recent.total} action{data.recent.total > 1 ? "s" : ""}, page {data.recent.page} sur{" "}
              {data.recent.pageCount}
            </p>
          )}
        </div>
        <Card className="border-border/50">
          <CardContent className="p-0">
            {data.recent.items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Aucune action enregistrée pour le moment.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {data.recent.items.map((activity) => {
                  const { label, icon } = describe(activity)
                  return (
                    <li key={activity.id} className="flex items-start gap-3 px-4 py-3 sm:px-6">
                      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted/60">
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          {activity.example_status && (
                            <Badge variant="outline" className={`text-[11px] ${STATUS_CLASSES[activity.example_status]}`}>
                              {STATUS_LABELS[activity.example_status]}
                            </Badge>
                          )}
                        </div>
                        {activity.example_text && (
                          <p className="truncate text-xs text-muted-foreground">{activity.example_text}</p>
                        )}
                      </div>
                      <p className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Pager page={data.recent.page} pageCount={data.recent.pageCount} hrefFor={pagerHref} />
      </section>
    </div>
  )
}
