import { cn } from '@/lib/utils'

const UPRIGHT_RANKS = new Set([
  'kingdom',
  'phylum',
  'class',
  'order',
  'superfamily',
  'family',
  'subfamily',
  'tribe',
  'infraorder',
  'suborder',
  'superorder',
  'infraclass',
  'subclass',
  'superclass',
])

interface ScientificNameProps {
  name: string | null | undefined
  /**
   * Taxonomic rank. Zoological convention italicises genus and below only, so
   * family/order names (e.g. "Ursidae") render upright when the rank is given.
   */
  rank?: string | null
  className?: string
}

/** A scientific (Latin) name, marked up with `lang="la"`. */
export function ScientificName({ name, rank, className }: ScientificNameProps) {
  if (!name) return null
  const upright = rank ? UPRIGHT_RANKS.has(rank.toLowerCase()) : false
  return (
    <span lang="la" className={cn(upright ? 'not-italic' : 'italic', 'tracking-normal', className)}>
      {name}
    </span>
  )
}
