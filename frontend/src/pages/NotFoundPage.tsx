import { Link } from 'react-router-dom'

import { Section } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '@/lib/page-meta'

export function NotFoundPage() {
  usePageMeta('Page not found')
  return (
    <Section className="py-32">
      <p className="type-mono mb-6">Error 404</p>
      <h1 className="type-h1 max-w-2xl">This trail goes cold.</h1>
      <p className="type-lead mt-5 max-w-prose">
        The page you were looking for does not exist or has moved. Try the species atlas, or start from the
        beginning.
      </p>
      <div className="mt-10 flex gap-4">
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/species">Species Atlas</Link>
        </Button>
      </div>
    </Section>
  )
}
