import { redirect } from "next/navigation"
import { ActivityExportButton, RefreshButton } from "@/components/activity-export-button"
import { UserDashboardView } from "@/components/user-dashboard-view"
import { getSessionProfile } from "@/lib/auth0"
import { getUserDashboard } from "@/lib/dashboard"
import { upsertUserFromAuth0, userDisplayName } from "@/lib/users"

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await getSessionProfile()
  if (!profile) redirect("/auth/login?returnTo=/dashboard")

  const user = await upsertUserFromAuth0(profile)
  if (!user) redirect("/account")

  const { page: pageParam } = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
  const data = await getUserDashboard(user.id, requestedPage, 10)

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-6 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mon tableau de bord</h1>
            <p className="text-muted-foreground">
              {userDisplayName(user) ?? "Votre activité"} · ce que vous avez fait et ce qu'il en est advenu.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ActivityExportButton fileLabel={userDisplayName(user) ?? "moi"} />
            <RefreshButton />
          </div>
        </div>
        <UserDashboardView data={data} pagerHref={(p) => `/dashboard?page=${p}#activite`} />
      </div>
    </div>
  )
}
