import { Auth0Client } from "@auth0/nextjs-auth0/server"
import type { Auth0Profile } from "./types"

// Client Auth0 partagé par proxy.ts (garde d'entrée du site), le layout (affichage
// de l'utilisateur) et les server actions (vérification de session).
// Lit AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET et APP_BASE_URL.
export const auth0 = new Auth0Client({
  authorizationParameters: {
    // Envoie directement sur Google, sans passer par l'écran de choix d'Auth0.
    // Supprimer cette ligne pour laisser Auth0 proposer toutes les connexions activées.
    connection: "google-oauth2",
  },
})

/** Profil Auth0 de la session courante (server components, server actions), ou null. */
export async function getSessionProfile(): Promise<Auth0Profile | null> {
  const session = await auth0.getSession()
  if (!session) return null
  return {
    sub: session.user.sub,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    picture: session.user.picture ?? null,
  }
}
