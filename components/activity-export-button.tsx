"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { fetchUserActivityExport } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Download, Loader2, RefreshCw } from "lucide-react"

interface ExportProps {
  /** Omis : l'utilisateur connecté. Sinon un autre utilisateur (code de supervision requis). */
  userId?: string
  /** Base du nom de fichier, ex. le nom de l'utilisateur. */
  fileLabel: string
}

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "utilisateur"
  )
}

/** Va chercher tout ce que l'utilisateur a fait et le télécharge en JSON. */
export function ActivityExportButton({ userId, fileLabel }: ExportProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchUserActivityExport(userId ? { userId } : {})
      if (!result.ok) {
        setError(result.error)
        return
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `activite-${slug(fileLabel)}-${new Date().toISOString().split("T")[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Une erreur est survenue.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isLoading} className="gap-2 bg-transparent">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Télécharger l'activité
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** Recharge les données de la page serveur sans la quitter. */
export function RefreshButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleClick = () => {
    setIsLoading(true)
    router.refresh()
    // router.refresh() ne renvoie pas de promesse : on relâche le bouton après un court délai.
    setTimeout(() => setIsLoading(false), 800)
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      disabled={isLoading}
      aria-label="Rafraîchir"
      className="bg-transparent"
    >
      <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
    </Button>
  )
}
