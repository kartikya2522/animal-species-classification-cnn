import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import { Section } from '@/components/Section'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '@/lib/page-meta'

/** A lazy route chunk that no longer exists (e.g. the site was rebuilt while the tab was open). */
function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(msg)
}

function describe(error: unknown): { message: string; detail?: string } {
  if (isRouteErrorResponse(error)) {
    return { message: 'The page could not be loaded.', detail: `${error.status} ${error.statusText}`.trim() }
  }
  if (isChunkLoadError(error)) {
    return {
      message:
        'Part of the site could not be downloaded. The connection may have dropped, or a newer version was published while this tab was open. Reloading usually fixes it.',
    }
  }
  return {
    message:
      'This page ran into an unexpected problem and stopped. The rest of the site still works: reload to try again, or go back to the start.',
    detail: error instanceof Error && error.name !== 'Error' ? error.name : undefined,
  }
}

/**
 * Error boundary for every route (React Router `errorElement`): a render or loading error in one
 * page replaces only the page content, the header and footer stay usable.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  usePageMeta('Something went wrong')
  const { message, detail } = describe(error)
  return (
    <Section className="py-24" data-testid="route-error">
      <p className="type-mono mb-6">Error</p>
      <h1 className="type-h1 max-w-2xl">This page could not be shown.</h1>
      <ErrorState
        className="mt-10 max-w-2xl"
        title="Something went wrong"
        message={message}
        detail={detail}
        action={
          <div className="flex gap-4">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button asChild variant="secondary">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        }
      />
    </Section>
  )
}
