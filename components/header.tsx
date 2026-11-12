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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ChevronDown, LayoutDashboard, LogIn, LogOut, Menu, Sparkles, UserRound } from "lucide-react"
import type { SessionUser } from "@/lib/types"

const NAV_LINKS = [
  { href: "/submit", label: "Soumettre" },
  { href: "/lissage", label: "Lissage" },
  { href: "/review", label: "Valider" },
  { href: "/export", label: "Exporter" },
]

/** Lien de connexion : balise brute, car /auth/login est une route du SDK à ne pas précharger. */
const LOGIN_HREF = "/auth/login?returnTo=/"

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
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg text-foreground hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span>GEC Collector</span>
        </Link>

        {/* À partir de 640 px : liens en ligne et menu de compte. */}
        <div className="hidden items-center gap-2 sm:flex">
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

          <div className="mx-1 h-6 w-px bg-border/60" aria-hidden />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Button asChild size="sm" className="gap-2 font-medium">
              <a href={LOGIN_HREF}>
                <LogIn className="size-4" />
                Se connecter
              </a>
            </Button>
          )}
        </div>

        {/* Sous 640 px : un seul bouton qui ouvre un panneau latéral. */}
        <MobileMenu user={user} pathname={pathname} />
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
          <span className="hidden max-w-[120px] truncate text-sm font-medium text-foreground md:inline">
            {firstName(user)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
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
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <LayoutDashboard className="size-4" />
            Mon tableau de bord
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account" className="cursor-pointer">
            <UserRound className="size-4" />
            Mon compte
          </Link>
        </DropdownMenuItem>
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

function MobileMenu({ user, pathname }: { user: SessionUser | null; pathname: string }) {
  const itemClass = "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Ouvrir le menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b border-border/40 p-4 pr-12 text-left">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigation et compte</SheetDescription>
          {user ? (
            <div className="flex items-center gap-3">
              <UserAvatar user={user} className="size-10 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{user.name ?? firstName(user)}</p>
                {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-foreground">GEC Collector</p>
          )}
        </SheetHeader>

        <nav className="flex flex-col gap-1 p-3">
          {NAV_LINKS.map(({ href, label }) => (
            <SheetClose asChild key={href}>
              <Link
                href={href}
                className={cn(
                  itemClass,
                  pathname === href ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {label}
              </Link>
            </SheetClose>
          ))}

          {!user && (
            <>
              <div className="my-2 h-px bg-border/60" aria-hidden />
              <a href={LOGIN_HREF} className={cn(itemClass, "bg-primary text-primary-foreground hover:bg-primary/90")}>
                <LogIn className="size-4" />
                Se connecter
              </a>
            </>
          )}

          {user && (
            <>
              <div className="my-2 h-px bg-border/60" aria-hidden />
              <SheetClose asChild>
                <Link
                  href="/dashboard"
                  className={cn(
                    itemClass,
                    pathname === "/dashboard" ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-muted",
                  )}
                >
                  <LayoutDashboard className="size-4" />
                  Mon tableau de bord
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link
                  href="/account"
                  className={cn(
                    itemClass,
                    pathname === "/account" ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-muted",
                  )}
                >
                  <UserRound className="size-4" />
                  Mon compte
                </Link>
              </SheetClose>
              {/* Lien brut volontaire, voir UserMenu. */}
              <a href="/auth/logout" className={cn(itemClass, "text-destructive hover:bg-destructive/10")}>
                <LogOut className="size-4" />
                Se déconnecter
              </a>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
