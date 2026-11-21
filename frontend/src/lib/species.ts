/**
 * Species data hooks (TanStack Query) and photo URL selection.
 *
 * Photos: when the backend has the offline cache (scripts/cache_species_images.py), use
 * its local copies; otherwise request a Commons thumbnail. Attribution always comes from
 * the KB entry, whichever URL is used.
 */
import { useQuery } from '@tanstack/react-query'

import { API_BASE, api, type SpeciesImage, type SpeciesImagesResponse } from '@/lib/api'
import { commonsThumb } from '@/lib/images'

export function useSpeciesList() {
  return useQuery({
    queryKey: ['species', 'extended'],
    queryFn: ({ signal }) => api.species({ extended: true }, signal),
    staleTime: Infinity,
  })
}

export function useSpeciesDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['species', 'detail', slug],
    queryFn: ({ signal }) => api.speciesDetail(slug as string, signal),
    enabled: Boolean(slug),
    staleTime: Infinity,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 1,
  })
}

const EMPTY: SpeciesImagesResponse = { count: 0, images: {} }

/** Local photo manifest; resolves to an empty manifest on any error (older backend, offline cache absent). */
export function useSpeciesImages() {
  return useQuery({
    queryKey: ['species-images'],
    queryFn: ({ signal }) => api.speciesImages(signal).catch(() => EMPTY),
    staleTime: Infinity,
    retry: false,
  })
}

export type PhotoKind = 'hero' | 'card'

const WIDTH: Record<PhotoKind, number> = { hero: 1280, card: 500 }

export function speciesPhotoUrl(
  slug: string,
  kind: PhotoKind,
  image: Pick<SpeciesImage, 'url' | 'width'> | null | undefined,
  local: SpeciesImagesResponse | undefined,
): string | null {
  const path = local?.images[slug]?.[kind]
  if (path) return `${API_BASE}${path}`
  return commonsThumb(image?.url, WIDTH[kind], image?.width)
}
