import { NextResponse, type NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"

// Pages consultables sans session. Tout le reste exige la connexion Google.
const PUBLIC_PATHS = new Set(["/"])

// Garde d'entrée : le site est derrière la connexion Google (Auth0), sauf la page
// d'accueil. Les routes /auth/* (login, callback, logout, profile), montées par le SDK,
// et les fichiers statiques exclus par le matcher restent accessibles sans session.
// Les appels de server actions sont des requêtes POST sur les pages : ils passent
// aussi par ici et sont redirigés s'il n'y a pas de session.
export async function proxy(request: NextRequest) {
  const authResponse = await auth0.middleware(request)
  const { pathname, search, origin } = request.nextUrl

  if (pathname.startsWith("/auth") || PUBLIC_PATHS.has(pathname)) {
    return authResponse
  }

  const session = await auth0.getSession(request)
  if (!session) {
    const loginUrl = new URL("/auth/login", origin)
    loginUrl.searchParams.set("returnTo", pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  return authResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
}
