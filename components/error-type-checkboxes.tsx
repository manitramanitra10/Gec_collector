"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { ErrorType } from "@/lib/types"

interface Props {
  errorTypes: ErrorType[]
  selected: string[]
  onChange: (codes: string[]) => void
  disabled?: boolean
}

/** Cases à cocher des types d'erreur, partagées par Soumettre et Corriger. */
export function ErrorTypeCheckboxes({ errorTypes, selected, onChange, disabled }: Props) {
  if (errorTypes.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun type d'erreur défini dans le référentiel.</p>
  }

  const toggle = (code: string, checked: boolean) => {
    onChange(checked ? [...new Set([...selected, code])] : selected.filter((c) => c !== code))
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {errorTypes.map((type) => {
        const id = `error-type-${type.code}`
        const checked = selected.includes(type.code)
        return (
          <label
            key={type.code}
            htmlFor={id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
              checked ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/30 hover:bg-muted/60"
            } ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(value) => toggle(type.code, value === true)}
            />
            <span className="flex-1">
              <Label htmlFor={id} className="cursor-pointer font-medium">
                {type.label}
              </Label>
              <span className="block font-mono text-[11px] text-muted-foreground">{type.code}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
