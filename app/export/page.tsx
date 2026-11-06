import { getStats } from "@/lib/examples"
import { hasAccess } from "@/lib/secrets"
import { ExportClient } from "./export-client"

export default async function ExportPage() {
  // Statistiques calculées côté serveur ; le téléchargement lui-même passe par /api/export
  // et exige le code d'export, vérifié côté serveur (cookie d'accès).
  const [stats, unlocked] = await Promise.all([getStats(), hasAccess("export")])
  return <ExportClient initialStats={stats} initiallyUnlocked={unlocked} />
}
