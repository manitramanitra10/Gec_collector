/** Jeton d'une comparaison mot à mot. */
export interface DiffToken {
  text: string
  kind: "same" | "removed" | "added"
}

/** Au-delà, la comparaison est ignorée (coût quadratique). */
const MAX_WORDS = 400

/**
 * Compare deux textes mot à mot (plus longue sous-séquence commune).
 * `left` marque en `removed` les mots du premier texte absents du second,
 * `right` marque en `added` les mots du second absents du premier.
 * Utilisable côté client comme côté serveur.
 */
export function wordDiff(left: string, right: string): { left: DiffToken[]; right: DiffToken[] } {
  const a = left.split(/\s+/).filter(Boolean)
  const b = right.split(/\s+/).filter(Boolean)
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return {
      left: a.map((text) => ({ text, kind: "same" as const })),
      right: b.map((text) => ({ text, kind: "same" as const })),
    }
  }

  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const outLeft: DiffToken[] = []
  const outRight: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      outLeft.push({ text: a[i], kind: "same" })
      outRight.push({ text: b[j], kind: "same" })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      outLeft.push({ text: a[i], kind: "removed" })
      i++
    } else {
      outRight.push({ text: b[j], kind: "added" })
      j++
    }
  }
  while (i < n) outLeft.push({ text: a[i++], kind: "removed" })
  while (j < m) outRight.push({ text: b[j++], kind: "added" })

  return { left: outLeft, right: outRight }
}
