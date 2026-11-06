import { hasAccess } from "@/lib/secrets"
import { ReviewClient } from "./review-client"

export default async function ReviewPage() {
  // Le code de validation est vérifié côté serveur ; le cookie d'accès décide de l'écran initial.
  const unlocked = await hasAccess("validate")
  return <ReviewClient initiallyUnlocked={unlocked} />
}
