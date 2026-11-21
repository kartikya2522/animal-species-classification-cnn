import { ChevronLeft, ChevronRight, ExternalLink, Maximize2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { API_BASE } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import type { FigureGroup, FigureItem } from '@/lib/research'

interface Group {
  id: FigureGroup
  label: string
  items: FigureItem[]
}

const src = (f: FigureItem) => `${API_BASE}${f.url}`

/**
 * Study figures from /api/figures, one tab per kind (only the open tab's images are mounted), in
 * fixed-ratio frames so lazy images never shift the layout. Click opens a lightbox.
 */
export function FigureGallery({ groups }: { groups: Group[] }) {
  const [tab, setTab] = useState(groups[0]?.id ?? 'dataset')
  const [open, setOpen] = useState<FigureItem | null>(null)
  const items = groups.find((g) => g.id === tab)?.items ?? []
  const index = open ? items.findIndex((f) => f.name === open.name) : -1
  const step = (d: number) => {
    if (index < 0 || items.length < 2) return
    setOpen(items[(index + d + items.length) % items.length] ?? null)
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as FigureGroup)}>
        <TabsList aria-label="Figure type">
          {groups.map((g) => (
            <TabsTrigger key={g.id} value={g.id}>
              {g.label}
              <span className="tabular ml-1.5 text-fg-muted">{g.items.length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((g) => (
          <TabsContent key={g.id} value={g.id} className="mt-8">
            <ul className="grid grid-cols-3 gap-6" data-testid="figure-grid">
              {g.items.map((f) => (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() => setOpen(f)}
                    className="group block w-full text-left"
                    aria-label={`Open figure: ${f.title}`}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded border border-border bg-white p-3 transition-colors group-hover:border-border-strong">
                      <img
                        src={src(f)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-contain"
                      />
                      <span className="absolute right-2 top-2 rounded-sm bg-surface-raised/90 p-1.5 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Maximize2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                      </span>
                    </span>
                    <span className="mt-3 block text-small font-medium text-fg">{f.title}</span>
                    {f.caption && <span className="mt-1 block text-caption text-fg-muted">{f.caption}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          className="flex max-h-[94vh] w-[min(92vw,1400px)] max-w-none flex-col gap-4 p-6"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') step(1)
            if (e.key === 'ArrowLeft') step(-1)
          }}
          data-testid="figure-lightbox"
        >
          {open && (
            <>
              <div className="pr-8">
                <DialogTitle className="type-h4">{open.title}</DialogTitle>
                <DialogDescription className="mt-1">
                  {open.caption || 'Figure from outputs/figures.'}
                </DialogDescription>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center rounded bg-white p-4">
                <img
                  src={src(open)}
                  alt={open.title}
                  className="max-h-[70vh] w-auto max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="type-mono">
                  {open.name} · {formatBytes(open.size_bytes)}
                </p>
                <div className="flex items-center gap-2">
                  {items.length > 1 && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => step(-1)}>
                        <ChevronLeft /> Previous
                      </Button>
                      <span className="tabular text-caption text-fg-muted">
                        {index + 1} / {items.length}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => step(1)}>
                        Next <ChevronRight />
                      </Button>
                    </>
                  )}
                  <Button asChild variant="secondary" size="sm">
                    <a href={src(open)} target="_blank" rel="noreferrer">
                      Full size <ExternalLink />
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
