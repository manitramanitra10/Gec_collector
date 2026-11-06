import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ActivityExportButton, RefreshButton } from "@/components/activity-export-button"
import { UserDashboardView } from "@/components/user-dashboard-view"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { getSessionProfile } from "@/lib/auth0"
import { getUserDashboard } from "@/lib/dashboard"
import { hasAccess } from "@/lib/secrets"
import { findUserById, userDisplayName } from "@/lib/users"
import { ArrowLeft } from "lucide-react"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SupervisionUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const profile = await getSessionProfile()
  const { userId } = await params
  if (!profile) redirect(`/auth/login?returnTo=/supervision/${userId}`)
  if (!(await hasAccess("supervision"))) redirect("/supervision")
  if (!UUID.test(userId)) notFound()

  const user = await findUserById(userId)
  if (!user) notFound()

  const { page: pageParam } = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
  const data = await getUserDashboard(user.id, requestedPage, 10)
  const name = userDisplayName(user) ?? "Compte"
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-6 space-y-8">
        <div className="space-y-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
            <Link href="/supervision">
              <ArrowLeft className="h-4 w-4" />
              Retour au suivi
            </Link>
          </Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="size-14 text-base">
                {user.picture_url && <AvatarImage src={user.picture_url} alt="" referrerPolicy="no-referrer" />}
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials || "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-foreground">{name}</h1>
                <p className="truncate text-muted-foreground">{user.email ?? "Adresse e-mail non fournie"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ActivityExportButton userId={user.id} fileLabel={name} />
              <RefreshButton />
            </div>
          </div>
        </div>
        <UserDashboardView
          data={data}
          perspective="other"
          pagerHref={(p) => `/supervision/${user.id}?page=${p}#activite`}
        />
      </div>
    </div>
  )
}
