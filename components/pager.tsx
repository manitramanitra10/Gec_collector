import Link from "next/link"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PagerProps {
  page: number
  pageCount: number
  /** Mode lien, pour les pages rendues côté serveur : construit l'URL d'une page. */
  hrefFor?: (page: number) => string
  /** Mode bouton, pour les composants client. */
  onPageChange?: (page: number) => void
  disabled?: boolean
  className?: string
}

/** Pages à afficher avec des ellipses : 1 … p-1 p p+1 … n. */
export function pageItems(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const items: (number | "ellipsis")[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)
  if (start > 2) items.push("ellipsis")
  for (let p = start; p <= end; p++) items.push(p)
  if (end < pageCount - 1) items.push("ellipsis")
  items.push(pageCount)
  return items
}

/**
 * Pagination partagée. Sans "use client" : rendue côté serveur avec `hrefFor`
 * (liens, aucun gestionnaire d'événement), ou dans un composant client avec
 * `onPageChange` (boutons). Ne rend rien s'il n'y a qu'une page.
 */
export function Pager({ page, pageCount, hrefFor, onPageChange, disabled, className }: PagerProps) {
  if (pageCount <= 1) return null

  const item = (
    target: number,
    label: React.ReactNode,
    opts: { active?: boolean; ariaLabel: string; isDisabled?: boolean; wide?: boolean },
  ) => {
    const common = {
      variant: opts.active ? ("outline" as const) : ("ghost" as const),
      size: opts.wide ? ("sm" as const) : ("icon" as const),
      className: cn(opts.wide ? "gap-1 px-2.5" : "size-9", opts.active && "pointer-events-none"),
      "aria-label": opts.ariaLabel,
      "aria-current": opts.active ? ("page" as const) : undefined,
    }
    if (hrefFor) {
      if (opts.isDisabled || disabled) {
        return (
          <Button {...common} disabled>
            {label}
          </Button>
        )
      }
      return (
        <Button {...common} asChild>
          <Link href={hrefFor(target)} scroll={false}>
            {label}
          </Link>
        </Button>
      )
    }
    return (
      <Button {...common} disabled={opts.isDisabled || disabled} onClick={() => onPageChange?.(target)}>
        {label}
      </Button>
    )
  }

  return (
    <nav role="navigation" aria-label="Pagination" className={cn("flex w-full justify-center", className)}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {item(
            page - 1,
            <>
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">Précédent</span>
            </>,
            { ariaLabel: "Page précédente", isDisabled: page <= 1, wide: true },
          )}
        </li>
        {pageItems(page, pageCount).map((p, i) =>
          p === "ellipsis" ? (
            <li key={`e${i}`} aria-hidden className="flex size-9 items-center justify-center text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </li>
          ) : (
            <li key={p}>{item(p, p, { active: p === page, ariaLabel: `Page ${p}` })}</li>
          ),
        )}
        <li>
          {item(
            page + 1,
            <>
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight className="size-4" />
            </>,
            { ariaLabel: "Page suivante", isDisabled: page >= pageCount, wide: true },
          )}
        </li>
      </ul>
    </nav>
  )
}
