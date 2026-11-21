import { Link } from 'react-router-dom'

import { HeatmapViewer } from '@/components/HeatmapViewer'
import { PredictionList } from '@/components/PredictionList'
import explain from '@/fixtures/explain-red-panda.json'
import photo from '@/fixtures/red-panda.jpg'
import { formatPercent } from '@/lib/format'

/**
 * A real /api/explain response from the deployed EfficientNetV2-S on the CC0 red-panda photograph
 * (captured in Phase 3, src/fixtures). Lazy-loaded so the fixture stays out of the home chunk.
 */
export default function ResultExample() {
  const top = explain.predictions[0]
  return (
    <div className="grid grid-cols-12 items-start gap-10">
      <div className="col-span-7">
        <HeatmapViewer
          imageSrc={photo}
          heatmapPng={explain.heatmap_png}
          width={explain.width}
          height={explain.height}
          alt="Red panda on a branch with the model's class-activation heatmap over its face and body"
          caption={top ? `${top.label} · ${formatPercent(top.probability)}` : undefined}
          method={explain.method}
          defaultOpacity={0.7}
        />
      </div>
      <div className="col-span-5">
        <p className="type-overline mb-4 !text-fg-muted">Top five, as the model returned them</p>
        <PredictionList
          predictions={explain.predictions}
          lowConfidence={explain.low_confidence}
          slugs={explain.slugs}
          renderLink={(slug, children) => (
            <Link to={`/species/${slug}`} className="hover:underline">
              {children}
            </Link>
          )}
        />
      </div>
    </div>
  )
}
