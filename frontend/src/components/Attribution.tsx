import type { SpeciesImage } from '@/lib/api'
import { safeHttpUrl } from '@/lib/url'
import { cn } from '@/lib/utils'

export type AttributionImage = Pick<
  SpeciesImage,
  'artist' | 'license' | 'license_url' | 'source_url' | 'provider'
>

interface AttributionProps {
  image: AttributionImage
  /** `caption` sits under a photo; `overlay` is light text for use on a dark scrim. */
  variant?: 'caption' | 'overlay'
  /** Adds "resized" for local copies that were scaled down from the Commons original. */
  resized?: boolean
  className?: string
}

/** Image credit: author, licence (linked) and source (linked). Required for Commons imagery. */
export function Attribution({ image, variant = 'caption', resized = false, className }: AttributionProps) {
  const linkCls =
    variant === 'overlay'
      ? 'underline decoration-white/40 underline-offset-2 hover:decoration-white'
      : 'underline decoration-border-strong underline-offset-2 hover:text-fg hover:decoration-accent'
  const author = image.artist?.trim() || 'Unknown author'
  // Links only for http(s) URLs; anything else is rendered as plain text.
  const sourceUrl = safeHttpUrl(image.source_url)
  const licenseUrl = safeHttpUrl(image.license_url)
  return (
    <p
      className={cn(
        'text-caption leading-snug',
        variant === 'overlay' ? 'text-white/90' : 'text-fg-muted',
        className,
      )}
    >
      <span className="sr-only">Image credit: </span>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
          {author}
        </a>
      ) : (
        author
      )}
      {image.license && (
        <>
          <span aria-hidden="true"> · </span>
          {licenseUrl ? (
            <a href={licenseUrl} target="_blank" rel="noopener noreferrer license" className={linkCls}>
              {image.license}
            </a>
          ) : (
            image.license
          )}
        </>
      )}
      {image.provider && (
        <>
          <span aria-hidden="true"> · </span>
          {image.provider}
        </>
      )}
      {resized && (
        <>
          <span aria-hidden="true"> · </span>
          resized
        </>
      )}
    </p>
  )
}
