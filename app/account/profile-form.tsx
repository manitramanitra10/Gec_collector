"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateProfile } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react"

interface Props {
  initial: { firstName: string; lastName: string }
}

export function ProfileForm({ initial }: Props) {
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [saved, setSaved] = useState<{ firstName: string; lastName: string }>(initial)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const dirty = firstName.trim() !== saved.firstName || lastName.trim() !== saved.lastName

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("saving")
    setError(null)

    try {
      const result = await updateProfile({ firstName, lastName })
      if (!result.ok) {
        setStatus("error")
        setError(result.error)
        return
      }
      setSaved({ firstName: result.firstName, lastName: result.lastName })
      setFirstName(result.firstName)
      setLastName(result.lastName)
      setStatus("saved")
      // Re-rend le layout pour que la barre de navigation affiche le nouveau nom.
      router.refresh()
    } catch {
      setStatus("error")
      setError("Une erreur est survenue.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Prénom et nom sont facultatifs. S'ils sont renseignés, ils remplacent le nom Google dans la barre de
        navigation.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first-name" className="text-base font-medium">
            Prénom
          </Label>
          <Input
            id="first-name"
            autoComplete="given-name"
            maxLength={80}
            placeholder="Votre prénom"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value)
              if (status !== "idle") setStatus("idle")
            }}
            className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name" className="text-base font-medium">
            Nom
          </Label>
          <Input
            id="last-name"
            autoComplete="family-name"
            maxLength={80}
            placeholder="Votre nom"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value)
              if (status !== "idle") setStatus("idle")
            }}
            className="bg-muted/50 border-border/50 focus:bg-background transition-colors"
          />
        </div>
      </div>

      {status === "error" && error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}
      {status === "saved" && (
        <div className="flex items-center gap-2 rounded-xl bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          Profil enregistré.
        </div>
      )}

      <Button
        type="submit"
        className="w-full h-12 text-base font-medium gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
        disabled={status === "saving" || !dirty}
      >
        {status === "saving" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Enregistrement...
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />
            Enregistrer
          </>
        )}
      </Button>
    </form>
  )
}
