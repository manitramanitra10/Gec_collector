"use client"

import type React from "react"

import { useEffect, useState, useCallback } from "react"
import { fetchExportData } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, FileJson, FileSpreadsheet, Loader2, Database, ThumbsUp, ThumbsDown, Users, Lock } from "lucide-react"
import type { Example, ExampleFilter, Stats } from "@/lib/types"

const EXPORT_CODE = "Gec_export"

export default function ExportPage() {
  const [isExportUnlocked, setIsExportUnlocked] = useState(false)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState(false)
  const [pendingExportType, setPendingExportType] = useState<"json" | "csv" | null>(null)

  const [examples, setExamples] = useState<Example[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    total: 0,
    toCorrect: 0,
    validated: 0,
    pending: 0,
    rejected: 0,
    totalVotes: 0,
    totalVotesUp: 0,
    totalVotesDown: 0,
  })
  const [filter, setFilter] = useState<ExampleFilter>("all")

  const handleCodeSubmit = () => {
    if (codeInput === EXPORT_CODE) {
      setIsExportUnlocked(true)
      setCodeError(false)
      setShowCodeModal(false)
      // Trigger the pending export
      if (pendingExportType === "json") {
        downloadJSON()
      } else if (pendingExportType === "csv") {
        downloadCSV()
      }
      setPendingExportType(null)
    } else {
      setCodeError(true)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCodeSubmit()
    }
  }

  const requestExport = (type: "json" | "csv") => {
    if (isExportUnlocked) {
      if (type === "json") {
        downloadJSON()
      } else {
        downloadCSV()
      }
    } else {
      setPendingExportType(type)
      setShowCodeModal(true)
      setCodeInput("")
      setCodeError(false)
    }
  }

  const fetchExamples = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchExportData(filter)
      setExamples(data.examples)
      setStats(data.stats)
    } catch {
      setExamples([])
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchExamples()
  }, [fetchExamples])

  const downloadJSON = () => {
    const data = examples.map((e) => ({
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
    }))

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `gec-corpus-${filter}-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadCSV = () => {
    const headers = [
      "incorrect",
      "correct",
      "error_types",
      "tags",
      "source",
      "status",
      "origin",
      "batch",
      "external_id",
      "votes_up",
      "votes_down",
    ]
    const csvText = (value: string | null | undefined) => `"${(value ?? "").replace(/"/g, '""')}"`
    const rows = examples.map((e) => [
      csvText(e.incorrect_text),
      csvText(e.correct_text),
      csvText((e.error_types || []).join(", ")),
      csvText((e.tags || []).join(", ")),
      csvText(e.source),
      csvText(e.status),
      csvText(e.origin),
      csvText(e.batch_name),
      csvText(e.external_id),
      e.votes_up || 0,
      e.votes_down || 0,
    ])

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `gec-corpus-${filter}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
                    setCodeError(false)
                  }}
                  onKeyPress={handleKeyPress}
                  className={codeError ? "border-destructive" : ""}
                  autoFocus
                />
                {codeError && <p className="text-sm text-destructive">Code incorrect. Veuillez réessayer.</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowCodeModal(false)} className="flex-1">
                  Annuler
                </Button>
                <Button onClick={handleCodeSubmit} className="flex-1">
                  Télécharger
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Export du corpus</h1>
          <p className="text-muted-foreground">Consultez les statistiques et téléchargez les exemples.</p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.toCorrect}</p>
                  <p className="text-xs text-muted-foreground">À corriger</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.validated}</p>
                  <p className="text-xs text-muted-foreground">Validés</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">En attente</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-destructive" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.rejected}</p>
                  <p className="text-xs text-muted-foreground">Rejetés</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalVotes}</p>
                  <p className="text-xs text-muted-foreground">Votes totaux</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <ThumbsUp className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalVotesUp}</p>
                  <p className="text-xs text-muted-foreground">Validations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <ThumbsDown className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalVotesDown}</p>
                  <p className="text-xs text-muted-foreground">Rejets</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Export Options */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Télécharger le corpus</CardTitle>
                <CardDescription>{examples.length} exemples disponibles à l'export.</CardDescription>
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Filtrer par statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous ({stats.total})</SelectItem>
                  <SelectItem value="to_correct">À corriger ({stats.toCorrect})</SelectItem>
                  <SelectItem value="validated">Validés ({stats.validated})</SelectItem>
                  <SelectItem value="pending">En attente ({stats.pending})</SelectItem>
                  <SelectItem value="rejected">Rejetés ({stats.rejected})</SelectItem>
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
                <Button onClick={() => requestExport("json")} className="w-full gap-2" disabled={examples.length === 0}>
                  <Download className="h-4 w-4" />
                  {isExportUnlocked ? "" : <Lock className="h-3 w-3" />}
                  Télécharger JSON ({examples.length} exemples)
                </Button>
              </TabsContent>

              <TabsContent value="csv" className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-4">
                  <pre className="overflow-x-auto text-xs text-muted-foreground">
                    {`incorrect,correct,error_types,tags,source,status,origin,batch,external_id,votes_up,votes_down
"Je suis alle au marché.","Je suis allé au marché.","VOYELLES_SUPPRIMEES","orthographe","","validated","synthetic","rova-2026-11","1",2,0
...`}
                  </pre>
                </div>
                <Button onClick={() => requestExport("csv")} className="w-full gap-2" disabled={examples.length === 0}>
                  <Download className="h-4 w-4" />
                  {isExportUnlocked ? "" : <Lock className="h-3 w-3" />}
                  Télécharger CSV ({examples.length} exemples)
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
