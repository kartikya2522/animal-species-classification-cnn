import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useId, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { pngDataUrl } from '@/lib/api'
import { colorizeHeatmap, HEATMAP_LEGEND_GRADIENT } from '@/lib/heatmap'
import { cn } from '@/lib/utils'

interface HeatmapViewerProps {
  /** The photo (object URL or data URL). */
  imageSrc: string
  /** Base64 grayscale PNG (`heatmap_png`) — colourised client-side in the site palette. */
  heatmapPng?: string
  /** Base64 RGB PNG (`overlay_png`) — used when no grayscale heatmap is given. */
  overlayPng?: string
  width: number
  height: number
  alt: string
  /** e.g. "Red panda · 97.7%". */
  caption?: string
  /** e.g. the `method` string from /api/explain. */
  method?: string
  defaultOpacity?: number
  /** CSS length: cap the photo's height without cropping (portrait photos get a narrower frame). */
  maxImageHeight?: string
  className?: string
}

export function HeatmapViewer({
  imageSrc,
  heatmapPng,
  overlayPng,
  width,
  height,
  alt,
  caption,
  method,
  defaultOpacity = 0.8,
  maxImageHeight,
  className,
}: HeatmapViewerProps) {
  const reduce = useReducedMotion()
  const id = useId()
  const [colorized, setColorized] = useState<{ src: string; url: string | null } | null>(null)
  const [visible, setVisible] = useState(true)
  const [opacity, setOpacity] = useState(defaultOpacity)

  useEffect(() => {
    if (!heatmapPng) return
    let cancelled = false
    colorizeHeatmap(pngDataUrl(heatmapPng))
      .then((url) => !cancelled && setColorized({ src: heatmapPng, url }))
      .catch(() => !cancelled && setColorized({ src: heatmapPng, url: null }))
    return () => {
      cancelled = true
    }
  }, [heatmapPng])

  const fallback = overlayPng ? pngDataUrl(overlayPng) : null
  const layer = heatmapPng ? (colorized?.src === heatmapPng ? (colorized.url ?? fallback) : null) : fallback

  return (
    <figure className={cn('w-full', className)}>
      <div
        className="relative mx-auto overflow-hidden rounded bg-surface-sunken"
        style={{
          aspectRatio: `${width} / ${height}`,
          ...(maxImageHeight ? { maxWidth: `calc(${maxImageHeight} * ${width / height})` } : {}),
        }}
      >
        <img src={imageSrc} alt={alt} className="absolute inset-0 size-full object-cover" />
        <AnimatePresence>
          {layer && visible && (
            <motion.div
              key={layer}
              className="absolute inset-0"
              initial={reduce ? { opacity: 0 } : { clipPath: 'inset(0 0 100% 0)' }}
              animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0 0 0% 0)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.2 : 1.4, ease: [0.45, 0, 0.25, 1] }}
            >
              <img
                src={layer}
                alt=""
                aria-hidden="true"
                className="size-full object-cover transition-opacity duration-200"
                style={{ opacity }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {layer && visible && !reduce && (
          <motion.div
            key={`scan-${layer}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px bg-[rgb(var(--scan))] shadow-[0_0_12px_2px_rgb(var(--scan)/0.55)]"
            initial={{ top: '0%', opacity: 1 }}
            animate={{ top: '100%', opacity: [1, 1, 0] }}
            transition={{
              duration: 1.4,
              ease: [0.45, 0, 0.25, 1],
              opacity: { times: [0, 0.85, 1], duration: 1.4 },
            }}
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <Switch id={`${id}-toggle`} checked={visible} onCheckedChange={setVisible} disabled={!layer} />
          <Label htmlFor={`${id}-toggle`} className="text-small text-fg">
            Heatmap
          </Label>
        </div>
        <div className="flex flex-1 items-center gap-3">
          <span className="text-caption text-fg-muted" id={`${id}-opacity`}>
            Opacity
          </span>
          <Slider
            value={[Math.round(opacity * 100)]}
            onValueChange={(v) => setOpacity((v[0] ?? 0) / 100)}
            min={0}
            max={100}
            step={5}
            disabled={!visible || !layer}
            aria-labelledby={`${id}-opacity`}
            thumbLabel="Heatmap opacity"
            className="max-w-48"
          />
          <span className="tabular w-9 text-right text-caption text-fg-muted">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-caption text-fg-muted" aria-hidden="true">
          <span>Low</span>
          <span
            className="h-1.5 w-20 rounded-full border border-border"
            style={{ background: HEATMAP_LEGEND_GRADIENT }}
          />
          <span>High</span>
        </div>
      </div>
      {(caption || method) && (
        <figcaption className="mt-3 flex items-baseline justify-between gap-6 border-t border-border pt-3">
          {caption && <span className="text-small text-fg-secondary">{caption}</span>}
          {method && <span className="type-mono">{method}</span>}
        </figcaption>
      )}
    </figure>
  )
}
