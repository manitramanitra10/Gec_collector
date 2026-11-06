import { NextResponse, type NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"

// Garde d'entrée : tout le site est derrière la connexion Google (Auth0).
// Seules les routes /auth/* (login, callback, logout, profile), montées par le SDK,
// et les fichiers statiques exclus par le matcher restent accessibles sans session.
// Les appels de server actions sont des requêtes POST sur les pages : ils passent
// aussi par ici et sont redirigés s'il n'y a pas de session.
export async function proxy(request: NextRequest) {
  const authResponse = await auth0.middleware(request)

  if (request.nextUrl.pathname.startsWith("/auth")) {
    return authResponse
  }

  const session = await auth0.getSession(request)
  if (!session) {
    const loginUrl = new URL("/auth/login", request.nextUrl.origin)
    loginUrl.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return authResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
}
