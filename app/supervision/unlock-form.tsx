"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { lockSupervision, unlockSupervision } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Lock, Unlock } from "lucide-react"

/** Saisie du code de la route de suivi ; la vérification se fait côté serveur. */
export function UnlockForm() {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await unlockSupervision({ code })
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Le cookie est posé : on re-rend la page serveur, qui affiche le suivi.
      router.refresh()
    } catch {
      setError("Une erreur est survenue.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-md px-6">
        <Card className="border-border/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Suivi des contributeurs</CardTitle>
            <CardDescription>Entrez le code de supervision pour consulter l'évolution des utilisateurs.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* suppressHydrationWarning : les gestionnaires de mots de passe injectent des attributs dans ce champ. */}
              <Input
                type="password"
                suppressHydrationWarning
                placeholder="Code de supervision"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  setError(null)
                }}
                autoFocus
                className={error ? "border-destructive" : ""}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full gap-2" disabled={isLoading || !code.trim()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                Déverrouiller
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Bouton de verrouillage affiché en haut de la route de suivi. */
export function LockButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLock = async () => {
    setIsLoading(true)
    try {
      await lockSupervision()
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLock} disabled={isLoading} className="gap-2 bg-transparent">
      <Lock className="h-4 w-4" />
      Verrouiller
    </Button>
  )
}
