import { redirect } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSessionProfile } from "@/lib/auth0"
import { upsertUserFromAuth0, userDisplayName } from "@/lib/users"
import { ProfileForm } from "./profile-form"

export default async function AccountPage() {
  // proxy.ts a déjà exigé une session ; cette garde couvre une session expirée entre-temps.
  const profile = await getSessionProfile()
  if (!profile) redirect("/auth/login?returnTo=/account")

  const user = await upsertUserFromAuth0(profile)

  if (!user) {
    return (
      <div className="min-h-screen bg-background py-12">
        <div className="mx-auto max-w-lg px-6">
          <Card className="border-border/50 text-center">
            <CardContent className="py-12">
              <p className="text-lg font-medium text-foreground">Compte désactivé</p>
              <p className="text-muted-foreground">Contactez un administrateur pour le réactiver.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const displayName = userDisplayName(user) ?? "Compte"
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-1/4 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-20 left-1/4 h-48 w-48 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg px-6">
        <Card className="border-border/50 shadow-xl shadow-primary/5">
          <CardHeader className="items-center text-center pb-2">
            <Avatar className="mx-auto mb-4 size-20 text-xl ring-4 ring-primary/15">
              {user.picture_url && <AvatarImage src={user.picture_url} alt="" referrerPolicy="no-referrer" />}
              <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials || "?"}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-2xl">{displayName}</CardTitle>
            <CardDescription className="text-base">{user.email ?? "Adresse e-mail non fournie par Google"}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ProfileForm initial={{ firstName: user.first_name ?? "", lastName: user.last_name ?? "" }} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
