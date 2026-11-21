import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Spinner } from '@/components/ui/spinner'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'

/* Route-level code splitting: each page is its own chunk; Leaflet and onnxruntime-web are
   further split inside their pages and load only when needed. */
const IdentifyPage = lazy(() => import('@/pages/IdentifyPage'))
const AtlasPage = lazy(() => import('@/pages/AtlasPage'))
const SpeciesProfilePage = lazy(() => import('@/pages/SpeciesProfilePage'))
const AskPage = lazy(() => import('@/pages/AskPage'))
const ResearchPage = lazy(() => import('@/pages/ResearchPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))

/** Dev-only component preview; the import is dropped from production bundles. */
const SHOW_UI_PREVIEW = import.meta.env.DEV || import.meta.env.VITE_UI_PREVIEW === 'true'
const UiPreview = SHOW_UI_PREVIEW ? lazy(() => import('@/pages/dev/UiPreview')) : null

function Page({ children, label = 'Loading page' }: { children: ReactNode; label?: string }) {
  return (
    <Suspense
      fallback={
        // Full viewport height so the footer starts below the fold and does not jump (CLS)
        // when the page chunk arrives.
        <div className="flex min-h-screen justify-center py-32">
          <Spinner label={label} />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

const pages: RouteObject[] = [
  { index: true, element: <HomePage /> },
  {
    path: 'identify',
    element: (
      <Page>
        <IdentifyPage />
      </Page>
    ),
  },
  {
    path: 'species',
    element: (
      <Page>
        <AtlasPage />
      </Page>
    ),
  },
  {
    path: 'species/:slug',
    element: (
      <Page>
        <SpeciesProfilePage />
      </Page>
    ),
  },
  {
    path: 'ask',
    element: (
      <Page>
        <AskPage />
      </Page>
    ),
  },
  {
    path: 'research',
    element: (
      <Page>
        <ResearchPage />
      </Page>
    ),
  },
  {
    path: 'about',
    element: (
      <Page>
        <AboutPage />
      </Page>
    ),
  },
  ...(UiPreview
    ? [
        {
          path: '__ui',
          element: (
            <Page label="Loading preview">
              <UiPreview />
            </Page>
          ),
        },
      ]
    : []),
  { path: '*', element: <NotFoundPage /> },
]

/* Every page gets its own error boundary, so an error replaces only the page content and the
   header/footer stay usable; the shell-level one is a last resort. */
const children: RouteObject[] = pages.map((route) => ({ ...route, errorElement: <RouteErrorPage /> }))

const router = createBrowserRouter([
  { path: '/', element: <AppShell />, errorElement: <RouteErrorPage />, children },
])

export function App() {
  return <RouterProvider router={router} />
}
