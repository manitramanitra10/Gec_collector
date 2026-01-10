"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ThumbsUp, ThumbsDown, Loader2, RefreshCw, CheckCircle, Lock, Unlock } from "lucide-react"
import type { Example } from "@/lib/types"

// Generate a simple hash for anonymous voting
function getVoterHash(): string {
  if (typeof window === "undefined") return ""
  let hash = localStorage.getItem("voter_hash")
  if (!hash) {
    hash = crypto.randomUUID()
    localStorage.setItem("voter_hash", hash)
  }
  return hash
}

const VALIDATION_CODE = "Gec_validate"

export default function ReviewPage() {
  const [examples, setExamples] = useState<Example[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [inputCode, setInputCode] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)

  const fetchExamples = useCallback(async () => {
    setIsLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("examples")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20)

    if (!error && data) {
      setExamples(data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchExamples()
  }, [fetchExamples])

  const handleUnlock = () => {
    if (inputCode === VALIDATION_CODE) {
      setIsUnlocked(true)
    } else {
      alert("Code incorrect. Veuillez réessayer.")
    }
  }

  const handleVote = async (exampleId: string, vote: 1 | -1) => {
    setVotingId(exampleId)
    const supabase = createClient()
    const voterHash = getVoterHash()

    try {
      // Insert vote
      const { error: voteError } = await supabase.from("votes").insert({
        example_id: exampleId,
        voter_hash: voterHash,
        vote,
      })

      if (voteError) {
        if (voteError.code === "23505") {
          // Duplicate vote
          alert("Vous avez déjà voté pour cet exemple.")
        }
        return
      }

      // Update vote count
      const example = examples.find((e) => e.id === exampleId)
      if (!example) return

      const newVotesUp = example.votes_up + (vote === 1 ? 1 : 0)
      const newVotesDown = example.votes_down + (vote === -1 ? 1 : 0)

      let newStatus = example.status
      if (newVotesUp >= 1) newStatus = "validated"
      if (newVotesDown >= 1) newStatus = "rejected"

      await supabase
        .from("examples")
        .update({
          votes_up: newVotesUp,
          votes_down: newVotesDown,
          status: newStatus,
        })
        .eq("id", exampleId)

      setVotedIds((prev) => new Set(prev).add(exampleId))

      // Refresh if status changed
      if (newStatus !== "pending") {
        setExamples((prev) => prev.filter((e) => e.id !== exampleId))
      } else {
        setExamples((prev) =>
          prev.map((e) => (e.id === exampleId ? { ...e, votes_up: newVotesUp, votes_down: newVotesDown } : e)),
        )
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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Validation</h1>
            <p className="text-muted-foreground">Votez pour valider ou rejeter les exemples soumis.</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchExamples} className="gap-2 bg-transparent">
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </Button>
        </div>

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

                  {example.tags && example.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
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
      </div>
    </div>
  )
}
