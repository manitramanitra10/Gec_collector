import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Header } from "@/components/header"
import { getSessionProfile } from "@/lib/auth0"
import { findUserBySub, upsertUserFromAuth0, userDisplayName } from "@/lib/users"
import type { SessionUser } from "@/lib/types"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "GEC Data Collection",
  description: "Plateforme de collecte de données pour la correction grammaticale",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Lecture du cookie de session : rend toutes les pages dynamiques, ce qui est
  // attendu puisque le site entier est derrière la connexion.
  const profile = await getSessionProfile()
  let user: SessionUser | null = null
  if (profile) {
    user = { name: profile.name, email: profile.email, picture: profile.picture }
    try {
      // Crée la ligne users à la première visite, puis privilégie le nom saisi
      // sur la page « Mon compte » au nom Google.
      const dbUser = (await findUserBySub(profile.sub)) ?? (await upsertUserFromAuth0(profile))
      if (dbUser) user.name = userDisplayName(dbUser) ?? user.name
    } catch (err) {
      console.error("layout : lecture de l'utilisateur impossible", err)
    }
  }

  return (
    <html lang="fr">
      <body className={`font-sans antialiased`}>
        <Header user={user} />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
