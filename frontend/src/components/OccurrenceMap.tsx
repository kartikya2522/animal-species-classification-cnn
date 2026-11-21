/**
 * World occurrence map: GBIF basemap tiles + GBIF Maps API v2 occurrence density for one
 * taxon. Leaflet (and its CSS) live in this module, which pages load with React.lazy so the
 * map library never lands in the initial bundle. No API key needed for either tile source.
 */
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'

import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface OccurrenceMapProps {
  taxonKey: number
  /** For the accessible description, e.g. "Red panda (Ailurus fulgens)". */
  label: string
  className?: string
}

const BASEMAP = (style: string) => `https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=${style}`
/** Ocean colour of each GBIF basemap style, used as the map background (see below). */
const OCEAN = { light: '#CFCFCF', dark: '#252525' } as const
/**
 * GBIF's "@1x" PNG tiles (basemap and density) are 512 px. Showing them at their native size
 * (zoomOffset -1 keeps Leaflet's 256-px zoom levels) keeps them sharp and halves the tile seams
 * that fractional zoom levels produce; the ocean-coloured background hides the rest.
 */
const TILE = { tileSize: 512, zoomOffset: -1 } as const
/**
 * Field observations only. The density endpoint accepts `basisOfRecord` (but not
 * `degreeOfEstablishment` or `establishmentMeans`), so museum specimens, material samples
 * (often zoo animals) and living specimens are left out: their coordinates usually mark the
 * collection, not where the animal lived. Captive animals reported as observations cannot be
 * excluded by the tile service; the caption on the profile page says so.
 */
const OBSERVATION_BASES = ['HUMAN_OBSERVATION', 'OBSERVATION', 'MACHINE_OBSERVATION', 'OCCURRENCE']
const DENSITY = (taxonKey: number) =>
  `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?taxonKey=${taxonKey}` +
  OBSERVATION_BASES.map((b) => `&basisOfRecord=${b}`).join('') +
  '&bin=hex&hexPerTile=128&style=classic.poly'

/** Zoom at which the 256 px Web Mercator world is exactly as wide as the frame (may be fractional). */
const fillZoom = (width: number) => Math.max(0, Math.log2(Math.max(width, 256) / 256))

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, © <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>, <a href="https://www.gbif.org/citation-guidelines" target="_blank" rel="noreferrer">GBIF</a>'

export default function OccurrenceMap({ taxonKey, label, className }: OccurrenceMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const { resolved } = useTheme()
  const [tileError, setTileError] = useState(false)

  useEffect(() => {
    if (!el.current) return
    // Open on the whole world exactly as wide as the frame: no empty side bands and no repeated
    // world. That zoom is usually fractional; it is only the floor (Leaflet clamps to minZoom
    // after snapping), so zooming in lands on whole zooms with seam-free tiles.
    const fit = fillZoom(el.current.clientWidth)
    const world = L.latLngBounds([-85, -180], [85, 180])
    const m = L.map(el.current, {
      center: [28, 10],
      zoom: fit,
      minZoom: fit,
      maxZoom: 9,
      zoomSnap: 1,
      zoomDelta: 1,
      maxBounds: world,
      maxBoundsViscosity: 1,
      scrollWheelZoom: false, // page scroll stays page scroll; use the +/- controls or drag
      attributionControl: true,
    })
    m.attributionControl.setPrefix(false)
    const density = L.tileLayer(DENSITY(taxonKey), {
      ...TILE,
      opacity: 0.75,
      zIndex: 2,
      crossOrigin: true,
      noWrap: true,
      bounds: world,
    })
    // (GBIF answers empty density tiles with 204, which Leaflet reports as tile errors: only
    // basemap errors are treated as a connectivity problem.)
    density.addTo(m)
    map.current = m
    // Keep the world filling the frame if the window is resized.
    const ro = new ResizeObserver(() => {
      const width = el.current?.clientWidth
      if (!width) return
      const z = fillZoom(width)
      const atFloor = m.getZoom() <= m.getMinZoom() + 1e-6
      m.invalidateSize({ pan: false })
      m.setMinZoom(z)
      if (atFloor || m.getZoom() < z) m.setZoom(z, { animate: false })
    })
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      base.current = null
    }
  }, [taxonKey])

  useEffect(() => {
    const m = map.current
    if (!m) return
    base.current?.remove()
    base.current = L.tileLayer(BASEMAP(resolved === 'dark' ? 'gbif-dark' : 'gbif-light'), {
      ...TILE,
      attribution: ATTRIBUTION,
      zIndex: 1,
      crossOrigin: true,
      noWrap: true,
      bounds: L.latLngBounds([-85, -180], [85, 180]),
    })
      .on('tileerror', () => setTileError(true))
      .addTo(m)
  }, [resolved, taxonKey])

  return (
    <figure className={cn('relative', className)}>
      <div
        ref={el}
        role="region"
        aria-label={`Map of GBIF occurrence records for ${label}`}
        data-testid="occurrence-map"
        className="wildlens-map h-[28rem] w-full overflow-hidden rounded border border-border"
        style={{ background: OCEAN[resolved === 'dark' ? 'dark' : 'light'] }}
      />
      {tileError && (
        <p className="absolute right-3 top-3 z-[500] rounded-sm bg-bg/90 px-3 py-1.5 text-caption text-fg-secondary">
          Some map tiles could not be loaded (offline?).
        </p>
      )}
    </figure>
  )
}
