"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, LogOut, Sparkles } from "lucide-react"
import type { SessionUser } from "@/lib/types"

const NAV_LINKS = [
  { href: "/submit", label: "Soumettre" },
  { href: "/review", label: "Valider" },
  { href: "/export", label: "Exporter" },
]

/** Initiales affichées quand l'avatar Google n'est pas disponible. */
function initials(user: SessionUser): string {
  const source = user.name?.trim() || user.email?.split("@")[0] || ""
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)
  return letters.toUpperCase() || "?"
}

function firstName(user: SessionUser): string {
  return user.name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "Compte"
}

export function Header({ user }: { user: SessionUser | null }) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg text-foreground hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span>GEC Collector</span>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Button
                key={href}
                asChild
                variant={pathname === href ? "secondary" : "ghost"}
                size="sm"
                className="font-medium"
              >
                <Link href={href}>{label}</Link>
              </Button>
            ))}
          </nav>

          {user && (
            <>
              <div className="mx-1 h-6 w-px bg-border/60" aria-hidden />
              <UserMenu user={user} />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function UserAvatar({ user, className }: { user: SessionUser; className?: string }) {
  return (
    <Avatar className={className}>
      {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(user)}</AvatarFallback>
    </Avatar>
  )
}

function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu du compte"
          className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted/60"
        >
          <UserAvatar
            user={user}
            className="size-8 text-xs ring-2 ring-primary/20 transition group-hover:ring-primary/50 group-data-[state=open]:ring-primary/50"
          />
          <span className="hidden max-w-[120px] truncate text-sm font-medium text-foreground sm:inline">
            {firstName(user)}
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 sm:inline" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <UserAvatar user={user} className="size-10 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.name ?? firstName(user)}</p>
            {user.email && <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Lien brut volontaire : un <Link> préchargerait /auth/logout et déconnecterait l'utilisateur. */}
        <DropdownMenuItem asChild variant="destructive">
          <a href="/auth/logout" className="cursor-pointer">
            <LogOut className="size-4" />
            Se déconnecter
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
