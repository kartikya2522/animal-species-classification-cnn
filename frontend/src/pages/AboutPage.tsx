import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ArchitectureDiagram } from '@/components/about/ArchitectureDiagram'
import { TeamSection } from '@/components/about/TeamSection'
import { Section, SectionHeader } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { TEAM } from '@/content/team'
import { usePageMeta } from '@/lib/page-meta'
import { REPO_URL } from '@/lib/site'

const STACK: Array<{ group: string; items: string[] }> = [
  {
    group: 'Interface',
    items: [
      'React 18 and TypeScript, built with Vite',
      'Tailwind CSS with Radix UI primitives (shadcn/ui style)',
      'TanStack Query, React Router',
      'Recharts for charts, Leaflet for maps',
      'Framer Motion, used sparingly',
      'Fraunces, Inter and JetBrains Mono (open fonts, self-hosted)',
    ],
  },
  {
    group: 'Server and model',
    items: [
      'Python, FastAPI and Uvicorn',
      'ONNX Runtime (server) and onnxruntime-web (browser)',
      'NumPy and Pillow for preprocessing and heatmaps',
      'httpx for the Field Guide’s source lookups',
      'Groq-hosted open Llama model, optional Ollama, or no model at all',
    ],
  },
  {
    group: 'Training and testing',
    items: [
      'PyTorch and torchvision for training and ONNX export',
      'pytest for the server and the model parity checks',
      'Vitest and Testing Library for the interface',
      'Playwright for end-to-end and browser/server parity tests',
    ],
  },
]

const SOURCES: Array<{ name: string; href: string; use: string; licence: string }> = [
  {
    name: 'Wikipedia',
    href: 'https://en.wikipedia.org/',
    use: 'Species summaries; text quoted by the Field Guide',
    licence: 'CC BY-SA 4.0, attributed to the linked article',
  },
  {
    name: 'Wikidata',
    href: 'https://www.wikidata.org/',
    use: 'Scientific names and IUCN Red List categories',
    licence: 'CC0 1.0',
  },
  {
    name: 'iNaturalist',
    href: 'https://www.inaturalist.org/',
    use: 'Taxonomy, common names and observation counts',
    licence: 'Factual metadata under the iNaturalist API terms',
  },
  {
    name: 'GBIF',
    href: 'https://www.gbif.org/',
    use: 'Taxon keys and occurrence map tiles',
    licence: 'GBIF terms of use; occurrence data licences vary by dataset and are credited on the map',
  },
  {
    name: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/',
    use: 'Species photographs and the photos on this site',
    licence: 'Each file’s own licence, credited under the photo',
  },
  {
    name: 'Animal-80 (Open Images, via Kaggle)',
    href: 'https://www.kaggle.com/antoreepjana/animals-detection-images-dataset',
    use: 'Training and test images for the models; not redistributed here',
    licence: 'Open Images annotations CC BY 4.0; images listed as CC BY 2.0',
  },
]

export default function AboutPage() {
  usePageMeta(
    'About',
    'What WildLens is, how it is built, where its data comes from and what happens to your photos and questions.',
  )
  return (
    <>
      <Section spacing="compact" className="pb-12 pt-20">
        <SectionHeader as="h1" eyebrow="About" title="About WildLens" className="mb-8" />
        <div className="grid grid-cols-12 gap-12">
          <p className="type-lead col-span-8">
            WildLens is the public face of a comparative study of four image-classification models trained on
            Animal-80, a dataset of 80 animal classes. It lets anyone run the study's EfficientNetV2-S model on a
            photograph and see a ranked answer with a heatmap of the evidence, browse the 80 classes with
            conservation status and occurrence maps, ask a source-citing Field Guide about any animal, and
            read how the models were built and where they fall short.
          </p>
          <div className="col-span-3 col-start-10 flex flex-col items-start gap-3 pt-2">
            <Button asChild variant="secondary">
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                Source code <ArrowUpRight />
              </a>
            </Button>
            <Link to="/research" className="link text-small">
              Research and limitations
            </Link>
          </div>
        </div>
      </Section>

      <Section spacing="compact" divided aria-labelledby="architecture-title">
        <SectionHeader
          id="architecture-title"
          size="md"
          title="Architecture"
          lead="One model file, two ways to run it. Locally, the browser talks to a small Python server; in browser mode the model runs inside the page."
        />
        <figure>
          <ArchitectureDiagram />
          <figcaption className="mt-8 grid grid-cols-3 gap-10 border-t border-border pt-8 text-small text-fg-secondary">
            <p>
              <strong className="font-semibold text-fg">Identify.</strong> In server mode the photo goes to
              the FastAPI server, which runs the exported EfficientNetV2-S model with ONNX Runtime and returns the top five
              and a heatmap from a single forward pass. In browser mode onnxruntime-web runs the same model in
              the tab.
            </p>
            <p>
              <strong className="font-semibold text-fg">Species and research.</strong> Species pages read a
              knowledge base built once from Wikipedia, Wikidata, iNaturalist and GBIF, so they work offline;
              the Research page reads the study&rsquo;s own result files and figures.
            </p>
            <p>
              <strong className="font-semibold text-fg">Field Guide.</strong> The server finds the animals in
              a question, retrieves sources, and asks Groq for an answer that cites them. Without a key — or
              if Groq fails — it falls back to a local Ollama model if configured, then to an answer assembled
              from the sources alone.
            </p>
          </figcaption>
        </figure>
      </Section>

      <Section spacing="compact" tone="surface" aria-labelledby="stack-title">
        <SectionHeader id="stack-title" size="md" title="Technology" />
        <div className="grid grid-cols-3 gap-12">
          {STACK.map((g) => (
            <div key={g.group}>
              <h3 className="type-overline mb-4 !text-fg-muted">{g.group}</h3>
              <ul className="divide-y divide-border border-y border-border text-small text-fg-secondary">
                {g.items.map((i) => (
                  <li key={i} className="py-2.5">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="type-caption mt-8">
          Everything runs on free tiers or locally; no paid service is required.
        </p>
      </Section>

      <Section spacing="compact" aria-labelledby="sources-title">
        <SectionHeader
          id="sources-title"
          size="md"
          title="Data sources and licences"
          lead="The code is MIT-licensed. Data and images come from third parties and keep their own licences."
        />
        <div className="overflow-hidden rounded border border-border bg-surface-raised">
          <table className="w-full text-left text-small">
            <thead className="border-b border-border bg-surface text-caption text-fg-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Source
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Used for
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Licence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-fg-secondary">
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <th scope="row" className="px-5 py-3 font-normal">
                    <a href={s.href} target="_blank" rel="noreferrer" className="link font-medium">
                      {s.name}
                    </a>
                  </th>
                  <td className="px-5 py-3">{s.use}</td>
                  <td className="px-5 py-3">{s.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="type-caption mt-4">
          IUCN Red List categories are shown as labels only, as published through Wikidata and iNaturalist.
          Full details are in{' '}
          <a
            href={`${REPO_URL}/blob/main/data/LICENSE-DATA.md`}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            data/LICENSE-DATA.md
          </a>
          .
        </p>
      </Section>

      <Section spacing="compact" tone="surface" aria-labelledby="privacy-title">
        <SectionHeader id="privacy-title" size="md" title="Privacy" />
        <div className="grid grid-cols-3 gap-12 text-small text-fg-secondary">
          <div>
            <h3 className="type-h4 mb-3 text-fg">Your photos</h3>
            <p>
              In the default server mode a photo is sent to the project&rsquo;s server, processed in memory
              and not stored. In browser mode it never leaves your browser. Results are kept only in the open
              tab.
            </p>
          </div>
          <div>
            <h3 className="type-h4 mb-3 text-fg">Your questions</h3>
            <p>
              Field Guide questions go to the project&rsquo;s server, which searches Wikipedia, Wikidata and
              iNaturalist for the animals they mention. If a Groq key is configured, the question, the recent
              conversation and the retrieved sources are also sent to Groq to write the answer. Questions are
              not stored by WildLens; the conversation lives in your browser tab.
            </p>
          </div>
          <div>
            <h3 className="type-h4 mb-3 text-fg">Everything else</h3>
            <p>
              Map tiles come straight from GBIF and some photographs from Wikimedia Commons, so those services
              see ordinary web requests. The server keeps a per-address request count in memory for rate
              limiting. Your browser keeps the theme choice and, in browser mode, a cached copy of the model
              file. There are no analytics or cookies.
            </p>
          </div>
        </div>
      </Section>

      <TeamSection members={TEAM} />
    </>
  )
}
