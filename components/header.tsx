"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

export function Header() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg text-foreground hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span>GEC Collector</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant={pathname === "/submit" ? "secondary" : "ghost"} size="sm" className="font-medium">
            <Link href="/submit">Soumettre</Link>
          </Button>
          <Button asChild variant={pathname === "/review" ? "secondary" : "ghost"} size="sm" className="font-medium">
            <Link href="/review">Valider</Link>
          </Button>
          <Button asChild variant={pathname === "/export" ? "secondary" : "ghost"} size="sm" className="font-medium">
            <Link href="/export">Exporter</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
