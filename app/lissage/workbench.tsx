"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { claimNextExample, correctExample, fetchBatches, rejectExample, skipExample } from "@/app/actions"
import { ErrorTypeCheckboxes } from "@/components/error-type-checkboxes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { wordDiff } from "@/lib/diff"
import type { Batch, ErrorType, Example } from "@/lib/types"
import { AlertCircle, CheckCircle2, Loader2, PencilLine, RefreshCw, SkipForward, Trash2 } from "lucide-react"

const ALL_BATCHES = "__all__"

const ORIGIN_LABELS: Record<Example["origin"], string> = {
  manual: "Saisie directe",
  synthetic: "Synthétique",
  web: "Web",
}

interface Props {
  errorTypes: ErrorType[]
  initialBatches: Batch[]
}

export function CorrectionWorkbench({ errorTypes, initialBatches }: Props) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches)
  const [batchId, setBatchId] = useState<string>(ALL_BATCHES)
  const [example, setExample] = useState<Example | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [incorrectText, setIncorrectText] = useState("")
  const [correctText, setCorrectText] = useState("")
  const [selectedErrors, setSelectedErrors] = useState<string[]>([])
  const [tags, setTags] = useState("")
  const [source, setSource] = useState("")

  const fillForm = (ex: Example | null) => {
    setIncorrectText(ex?.incorrect_text ?? "")
    setCorrectText(ex?.correct_text ?? "")
    setSelectedErrors(ex?.error_types ?? [])
    setTags(ex?.tags.join(", ") ?? "")
    setSource(ex?.source ?? "")
  }

  const loadNext = useCallback(async (selectedBatch: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await claimNextExample({ batchId: selectedBatch === ALL_BATCHES ? null : selectedBatch })
      if (!result.ok) {
        setError(result.error)
        setExample(null)
        return
      }
      setExample(result.example)
      setRemaining(result.remaining)
      fillForm(result.example)
    } catch {
      setError("Impossible de charger le prochain exemple.")
      setExample(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshBatches = useCallback(async () => {
    try {
      setBatches(await fetchBatches())
    } catch {
      // Les compteurs de lots sont indicatifs : on garde les derniers connus.
    }
  }, [])

  useEffect(() => {
    loadNext(batchId)
  }, [batchId, loadNext])

  const diff = useMemo(() => wordDiff(incorrectText, correctText), [incorrectText, correctText])

  const advance = async (message: string) => {
    setNotice(message)
    await Promise.all([loadNext(batchId), refreshBatches()])
  }

  const handleCorrect = async () => {
    if (!example) return
    if (!incorrectText.trim() || !correctText.trim()) {
      setError("Les deux champs de texte sont obligatoires.")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const result = await correctExample({
        exampleId: example.id,
        incorrectText,
        correctText,
        tags,
        source,
        errorTypes: selectedErrors,
      })
      if (result.outcome === "done") {
        await advance("Correction enregistrée, l'exemple est envoyé en validation.")
      } else if (result.outcome === "locked") {
        setError("Quelqu'un d'autre lisse cet exemple en ce moment. Passez au suivant.")
      } else if (result.outcome === "not_found") {
        await advance("Cet exemple a déjà été traité par quelqu'un d'autre.")
      } else {
        setError(result.error)
      }
    } catch {
      setError("Une erreur est survenue.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSkip = async () => {
    if (!example) return
    setIsSaving(true)
    setError(null)
    try {
      await skipExample({ exampleId: example.id })
      await advance("Exemple passé, il reviendra plus tard.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleReject = async () => {
    if (!example) return
    if (!confirm("Rejeter cet exemple ? Il ne passera pas en validation.")) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await rejectExample({ exampleId: example.id })
      if (result.outcome === "done" || result.outcome === "not_found") {
        await advance("Exemple rejeté.")
      } else if (result.outcome === "locked") {
        setError("Quelqu'un d'autre lisse cet exemple en ce moment. Passez au suivant.")
      } else {
        setError(result.error)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Ctrl+Entrée (ou Cmd+Entrée) envoie le lissage depuis n'importe quel champ.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      handleCorrect()
    }
  }

  const busy = isLoading || isSaving
  const totalToCorrect = batches.reduce((sum, b) => sum + b.counts.to_correct, 0)

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lissage</h1>
            <p className="text-muted-foreground">
              Relisez les exemples importés un par un, lissez-les, puis envoyez-les en validation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={batchId} onValueChange={setBatchId} disabled={busy}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Lot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BATCHES}>Tous les lots ({totalToCorrect})</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.counts.to_correct})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadNext(batchId)}
              disabled={busy}
              aria-label="Rafraîchir"
              className="bg-transparent"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {notice && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-success/10 p-4 text-sm text-success">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !example ? (
          <Card className="border-border/50 text-center">
            <CardContent className="py-12">
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
              <p className="mt-4 text-lg font-medium text-foreground">Rien à lisser</p>
              <p className="text-muted-foreground">
                {batchId === ALL_BATCHES
                  ? "Tous les exemples importés ont été traités, ou sont en cours de lissage par d'autres."
                  : "Ce lot est entièrement traité, ou ses exemples restants sont en cours de lissage."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 shadow-xl shadow-primary/5" onKeyDown={onKeyDown}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <PencilLine className="h-4 w-4 text-primary" />
                    Exemple à lisser
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Encore {remaining} à lisser
                    {batchId !== ALL_BATCHES ? " dans ce lot" : ""}. Ctrl+Entrée pour envoyer.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">{ORIGIN_LABELS[example.origin]}</Badge>
                  {example.batch_name && <Badge variant="secondary">{example.batch_name}</Badge>}
                  {example.external_id && (
                    <Badge variant="secondary" className="font-mono">
                      #{example.external_id}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="incorrect" className="text-base font-medium">
                  Phrase incorrecte <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="incorrect"
                  value={incorrectText}
                  onChange={(e) => setIncorrectText(e.target.value)}
                  rows={3}
                  disabled={isSaving}
                  className="bg-destructive/5 border-border/50 focus:bg-background transition-colors"
                />
                <DiffLine tokens={diff.left} emptyLabel="Aucun mot propre à la phrase incorrecte." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="correct" className="text-base font-medium">
                  Phrase corrigée <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="correct"
                  value={correctText}
                  onChange={(e) => setCorrectText(e.target.value)}
                  rows={3}
                  disabled={isSaving}
                  className="bg-success/5 border-border/50 focus:bg-background transition-colors"
                />
                <DiffLine tokens={diff.right} emptyLabel="Aucun mot propre à la phrase corrigée." />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-medium">Types d'erreur</Label>
                <ErrorTypeCheckboxes
                  errorTypes={errorTypes}
                  selected={selectedErrors}
                  onChange={setSelectedErrors}
                  disabled={isSaving}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="grammaire, orthographe..."
                    disabled={isSaving}
                    className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input
                    id="source"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="URL ou référence..."
                    disabled={isSaving}
                    className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button
                  onClick={handleCorrect}
                  disabled={isSaving}
                  className="flex-1 h-11 gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Envoyer en validation
                </Button>
                <Button variant="outline" onClick={handleSkip} disabled={isSaving} className="h-11 gap-2 bg-transparent">
                  <SkipForward className="h-4 w-4" />
                  Passer
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReject}
                  disabled={isSaving}
                  className="h-11 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive bg-transparent"
                >
                  <Trash2 className="h-4 w-4" />
                  Rejeter
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

/** Aperçu des mots qui diffèrent entre les deux phrases. */
function DiffLine({ tokens, emptyLabel }: { tokens: ReturnType<typeof wordDiff>["left"]; emptyLabel: string }) {
  const hasChange = tokens.some((t) => t.kind !== "same")
  if (!hasChange) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm leading-relaxed">
      {tokens.map((t, i) => (
        <span
          key={i}
          className={
            t.kind === "removed"
              ? "rounded bg-destructive/15 px-0.5 font-medium text-destructive"
              : t.kind === "added"
                ? "rounded bg-success/15 px-0.5 font-medium text-success"
                : "text-muted-foreground"
          }
        >
          {t.text}
          {i < tokens.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  )
}
