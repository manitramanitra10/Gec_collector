"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { submitExample } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { AlertCircle, Loader2, Send, Sparkles } from "lucide-react"

export default function SubmitPage() {
  const [incorrectText, setIncorrectText] = useState("")
  const [correctText, setCorrectText] = useState("")
  const [tags, setTags] = useState("")
  const [source, setSource] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    if (!incorrectText.trim() || !correctText.trim()) {
      setError("Les deux champs de texte sont obligatoires.")
      setIsLoading(false)
      return
    }

    try {
      const result = await submitExample({ incorrectText, correctText, tags, source })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push("/thanks")
    } catch {
      setError("Une erreur est survenue.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-1/4 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-20 left-1/4 h-48 w-48 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-6">
        <Card className="border-border/50 shadow-xl shadow-primary/5">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Soumettre un exemple</CardTitle>
            <CardDescription className="text-base">
              Ajoutez une paire de phrases pour contribuer au corpus GEC.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="incorrect" className="text-base font-medium">
                  Phrase incorrecte <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="incorrect"
                  placeholder="Entrez la phrase contenant des erreurs..."
                  value={incorrectText}
                  onChange={(e) => setIncorrectText(e.target.value)}
                  rows={3}
                  className="resize-none bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="correct" className="text-base font-medium">
                  Phrase corrigee <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="correct"
                  placeholder="Entrez la version corrigee..."
                  value={correctText}
                  onChange={(e) => setCorrectText(e.target.value)}
                  rows={3}
                  className="resize-none bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags" className="text-base font-medium">
                  Tags (optionnel)
                </Label>
                <Input
                  id="tags"
                  placeholder="grammaire, orthographe, syntaxe..."
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
                <p className="text-xs text-muted-foreground">Separez les tags par des virgules.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source" className="text-base font-medium">
                  Source (optionnel)
                </Label>
                <Input
                  id="source"
                  placeholder="URL ou reference de la source..."
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Soumettre l'exemple
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
