"use client"

import { useState } from "react"
import { fetchExportStats, unlockExport } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Database,
  ThumbsUp,
  ThumbsDown,
  Users,
  Lock,
  RefreshCw,
} from "lucide-react"
import type { ExampleFilter, Stats } from "@/lib/types"

type Format = "json" | "csv"

interface Props {
  initialStats: Stats
  initiallyUnlocked: boolean
}

function countFor(stats: Stats, filter: ExampleFilter): number {
  switch (filter) {
    case "to_correct":
      return stats.toCorrect
    case "pending":
      return stats.pending
    case "validated":
      return stats.validated
    case "rejected":
      return stats.rejected
    default:
      return stats.total
  }
}

export function ExportClient({ initialStats, initiallyUnlocked }: Props) {
  const [stats, setStats] = useState<Stats>(initialStats)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filter, setFilter] = useState<ExampleFilter>("validated")

  const [isUnlocked, setIsUnlocked] = useState(initiallyUnlocked)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [pendingFormat, setPendingFormat] = useState<Format | null>(null)

  const count = countFor(stats, filter)

  /** Le fichier est produit en flux par /api/export : le navigateur le télécharge directement. */
  const download = (format: Format) => {
    window.location.assign(`/api/export?format=${format}&filter=${filter}`)
  }

  const requestExport = (format: Format) => {
    if (isUnlocked) {
      download(format)
      return
    }
    setPendingFormat(format)
    setCodeInput("")
    setCodeError(null)
    setShowCodeModal(true)
  }

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return
    setIsUnlocking(true)
    setCodeError(null)
    try {
      const result = await unlockExport({ code: codeInput })
      if (!result.ok) {
        setCodeError(result.error)
        return
      }
      setIsUnlocked(true)
      setShowCodeModal(false)
      if (pendingFormat) download(pendingFormat)
      setPendingFormat(null)
    } catch {
      setCodeError("Une erreur est survenue.")
    } finally {
      setIsUnlocking(false)
    }
  }

  const refreshStats = async () => {
    setIsRefreshing(true)
    try {
      setStats(await fetchExportStats())
    } catch {
      // Les chiffres affichés restent les derniers connus.
    } finally {
      setIsRefreshing(false)
    }
  }

  const tile = (value: number, label: string, icon: React.ReactNode) => (
    <Card className="border-border/50">
      <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const downloadButton = (format: Format, label: string) => (
    <Button onClick={() => requestExport(format)} className="w-full gap-2" disabled={count === 0}>
      <Download className="h-4 w-4" />
      {isUnlocked ? null : <Lock className="h-3 w-3" />}
      {label} ({count} exemples)
    </Button>
  )

  return (
    <div className="min-h-screen bg-background py-12">
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <Card className="w-full max-w-md border-border/50">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Code requis pour l'export</CardTitle>
              <CardDescription>Entrez le code d'accès pour télécharger les données.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="export-code">Code d'accès</Label>
                <Input
                  id="export-code"
                  type="password"
                  suppressHydrationWarning
                  placeholder="Entrez le code..."
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value)
                    setCodeError(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
                  className={codeError ? "border-destructive" : ""}
                  autoFocus
                />
                {codeError && <p className="text-sm text-destructive">{codeError}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowCodeModal(false)} className="flex-1">
                  Annuler
                </Button>
                <Button onClick={handleCodeSubmit} className="flex-1 gap-2" disabled={isUnlocking || !codeInput.trim()}>
                  {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Télécharger
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Export du corpus</h1>
            <p className="text-muted-foreground">Consultez les statistiques et téléchargez les exemples.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshStats}
            disabled={isRefreshing}
            className="gap-2 self-start bg-transparent"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {tile(stats.total, "Total", <Database className="h-5 w-5 text-muted-foreground" />)}
          {tile(stats.toCorrect, "À lisser", <div className="h-3 w-3 rounded-full bg-primary" />)}
          {tile(stats.validated, "Validés", <div className="h-3 w-3 rounded-full bg-emerald-500" />)}
          {tile(stats.pending, "En attente", <div className="h-3 w-3 rounded-full bg-amber-500" />)}
          {tile(stats.rejected, "Rejetés", <div className="h-3 w-3 rounded-full bg-destructive" />)}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tile(stats.totalVotes, "Votes totaux", <Users className="h-5 w-5 text-primary" />)}
          {tile(stats.totalVotesUp, "Validations", <ThumbsUp className="h-5 w-5 text-emerald-500" />)}
          {tile(stats.totalVotesDown, "Rejets", <ThumbsDown className="h-5 w-5 text-destructive" />)}
        </div>

        <Card className="border-border/50">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Télécharger le corpus</CardTitle>
                <CardDescription>
                  {count} exemples disponibles à l'export. Le fichier est généré au fil de l'eau, sans limite de
                  taille.
                </CardDescription>
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as ExampleFilter)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filtrer par statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="validated">Validés ({stats.validated})</SelectItem>
                  <SelectItem value="pending">En attente ({stats.pending})</SelectItem>
                  <SelectItem value="to_correct">À lisser ({stats.toCorrect})</SelectItem>
                  <SelectItem value="rejected">Rejetés ({stats.rejected})</SelectItem>
                  <SelectItem value="all">Tous ({stats.total})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="json">
              <TabsList className="mb-4">
                <TabsTrigger value="json" className="gap-2">
                  <FileJson className="h-4 w-4" />
                  JSON
                </TabsTrigger>
                <TabsTrigger value="csv" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV
                </TabsTrigger>
              </TabsList>

              <TabsContent value="json" className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-4">
                  <pre className="overflow-x-auto text-xs text-muted-foreground">
                    {`[
  {
    "incorrect": "Je suis alle au marché.",
    "correct": "Je suis allé au marché.",
    "error_types": ["VOYELLES_SUPPRIMEES"],
    "tags": ["orthographe"],
    "source": null,
    "status": "validated",
    "origin": "synthetic",
    "batch": "rova-2026-11",
    "external_id": "1",
    "votes_up": 2,
    "votes_down": 0
  },
  ...
]`}
                  </pre>
                </div>
                {downloadButton("json", "Télécharger JSON")}
              </TabsContent>

              <TabsContent value="csv" className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-4">
                  <pre className="overflow-x-auto text-xs text-muted-foreground">
                    {`incorrect,correct,error_types,tags,source,status,origin,batch,external_id,votes_up,votes_down
"Je suis alle au marché.","Je suis allé au marché.","VOYELLES_SUPPRIMEES","orthographe","","validated","synthetic","rova-2026-11","1",2,0
...`}
                  </pre>
                </div>
                {downloadButton("csv", "Télécharger CSV")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
