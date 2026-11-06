"use client"

import { useEffect, useState, useCallback } from "react"
import { fetchErrorTypes, fetchPendingExamples, voteOnExample } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Pager } from "@/components/pager"
import { ThumbsUp, ThumbsDown, Loader2, RefreshCw, CheckCircle, Lock, Unlock } from "lucide-react"
import type { Example } from "@/lib/types"

const VALIDATION_CODE = "Gec_validate"

const ORIGIN_LABELS: Record<Example["origin"], string> = {
  manual: "Saisie directe",
  synthetic: "Synthétique",
  web: "Web",
}

export default function ReviewPage() {
  const [examples, setExamples] = useState<Example[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [inputCode, setInputCode] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errorLabels, setErrorLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchErrorTypes()
      .then((types) => setErrorLabels(Object.fromEntries(types.map((t) => [t.code, t.label]))))
      .catch(() => {})
  }, [])

  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchExamples = useCallback(async (requestedPage: number) => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await fetchPendingExamples({ page: requestedPage })
      setExamples(result.items)
      setTotal(result.total)
      setPageCount(result.pageCount)
      // Le serveur ramène la page dans les bornes si la file a rétréci entre-temps.
      setPage(result.page)
    } catch {
      setLoadError("Impossible de charger les exemples. Vérifiez la connexion à la base de données.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExamples(page)
  }, [fetchExamples, page])

  const handleUnlock = () => {
    if (inputCode === VALIDATION_CODE) {
      setIsUnlocked(true)
    } else {
      alert("Code incorrect. Veuillez réessayer.")
    }
  }

  const handleVote = async (exampleId: string, vote: 1 | -1) => {
    setVotingId(exampleId)

    try {
      // Le votant est l'utilisateur connecté, identifié côté serveur.
      const result = await voteOnExample({ exampleId, vote })

      if (result.outcome === "duplicate") {
        alert("Vous avez déjà voté pour cet exemple.")
        return
      }
      if (result.outcome === "not_found") {
        setExamples((prev) => prev.filter((e) => e.id !== exampleId))
        return
      }
      if (result.outcome === "error") {
        alert(result.error)
        return
      }

      // Compteurs et statut sont calculés côté serveur, en transaction.
      const updated = result.example
      setVotedIds((prev) => new Set(prev).add(exampleId))

      if (updated.status !== "pending") {
        const remainingOnPage = examples.filter((e) => e.id !== exampleId)
        setExamples(remainingOnPage)
        setTotal((t) => Math.max(0, t - 1))
        // Page vidée par les votes : on recharge pour faire remonter la suite de la file.
        if (remainingOnPage.length === 0 && total > 1) {
          await fetchExamples(page)
        }
      } else {
        setExamples((prev) => prev.map((e) => (e.id === exampleId ? updated : e)))
      }
    } finally {
      setVotingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-background py-12">
        <div className="mx-auto max-w-md px-6">
          <Card className="border-border/50">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Accès sécurisé</CardTitle>
              <CardDescription>Entrez le code de validation pour accéder à la page de review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="password"
                suppressHydrationWarning
                placeholder="Code de validation"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              />
              <Button onClick={handleUnlock} className="w-full gap-2">
                <Unlock className="h-4 w-4" />
                Déverrouiller
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Validation</h1>
            <p className="text-muted-foreground">
              Votez pour valider ou rejeter les exemples soumis.
              {total > 0 && (
                <>
                  {" "}
                  {total} en attente, page {page} sur {pageCount}.
                </>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchExamples(page)}
            className="gap-2 self-start bg-transparent"
          >
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </Button>
        </div>

        {loadError && (
          <div className="mb-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{loadError}</div>
        )}

        {examples.length === 0 ? (
          <Card className="border-border/50 text-center">
            <CardContent className="py-12">
              <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
              <p className="mt-4 text-lg font-medium text-foreground">Aucun exemple en attente</p>
              <p className="text-muted-foreground">Tous les exemples ont été validés ou rejetés.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {examples.map((example) => (
              <Card key={example.id} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <CardTitle className="text-base font-medium">Exemple à valider</CardTitle>
                      <CardDescription className="text-xs">
                        {new Date(example.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <ThumbsUp className="h-3.5 w-3.5" />
                        {example.votes_up}
                      </span>
                      <span className="flex items-center gap-1 text-destructive">
                        <ThumbsDown className="h-3.5 w-3.5" />
                        {example.votes_down}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="rounded-lg bg-destructive/5 p-3">
                      <p className="text-xs font-medium text-destructive mb-1">Incorrect</p>
                      <p className="text-sm text-foreground">{example.incorrect_text}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-500/5 p-3">
                      <p className="text-xs font-medium text-emerald-600 mb-1">Correct</p>
                      <p className="text-sm text-foreground">{example.correct_text}</p>
                    </div>
                  </div>

                  {(example.origin !== "manual" || example.error_types.length > 0 || example.tags.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {example.origin !== "manual" && (
                        <Badge variant="outline" className="text-xs">
                          {ORIGIN_LABELS[example.origin]}
                          {example.batch_name ? ` · ${example.batch_name}` : ""}
                        </Badge>
                      )}
                      {example.error_types.map((code) => (
                        <Badge key={code} variant="secondary" className="text-xs">
                          {errorLabels[code] ?? code}
                        </Badge>
                      ))}
                      {example.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 bg-transparent"
                      onClick={() => handleVote(example.id, 1)}
                      disabled={votingId === example.id || votedIds.has(example.id)}
                    >
                      {votingId === example.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4" />
                      )}
                      Valider
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive bg-transparent"
                      onClick={() => handleVote(example.id, -1)}
                      disabled={votingId === example.id || votedIds.has(example.id)}
                    >
                      {votingId === example.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsDown className="h-4 w-4" />
                      )}
                      Rejeter
                    </Button>
                  </div>

                  {votedIds.has(example.id) && (
                    <p className="text-center text-xs text-muted-foreground">Vote enregistré</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Pager page={page} pageCount={pageCount} onPageChange={setPage} disabled={isLoading} className="mt-8" />
      </div>
    </div>
  )
}
