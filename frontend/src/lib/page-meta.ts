import { useEffect } from 'react'

export const SITE_NAME = 'WildLens'
export const DEFAULT_DESCRIPTION =
  'WildLens — identify an animal from a photo, see why the model decided, and explore the species.'

/** "Research · WildLens"; the home page passes no title and gets the bare site name. */
export function pageTitle(title?: string | null): string {
  return title ? `${title} · ${SITE_NAME}` : SITE_NAME
}

/** Sets `document.title` and the meta description for the current route. */
export function usePageMeta(title: string | null | undefined, description: string = DEFAULT_DESCRIPTION) {
  useEffect(() => {
    document.title = pageTitle(title)
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = description
  }, [title, description])
}
