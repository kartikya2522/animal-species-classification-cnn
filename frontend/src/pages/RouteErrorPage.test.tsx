import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RouteErrorPage } from '@/pages/RouteErrorPage'

function Broken(): never {
  throw new Error('boom')
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Home content</p>, errorElement: <RouteErrorPage /> },
      { path: '/broken', element: <Broken />, errorElement: <RouteErrorPage /> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

// React re-dispatches caught render errors as window "error" events, which jsdom prints.
const swallow = (e: ErrorEvent) => e.preventDefault()

describe('RouteErrorPage', () => {
  beforeEach(() => {
    window.addEventListener('error', swallow)
    // React and React Router log caught render errors; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    window.removeEventListener('error', swallow)
    vi.restoreAllMocks()
  })

  it('replaces a crashed page with a calm error state, Reload and Go home', async () => {
    renderAt('/broken')
    expect(screen.getByTestId('route-error')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/unexpected problem/)
    expect(screen.queryByText('boom')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(document.title).toBe('Something went wrong · WildLens')

    await userEvent.click(screen.getByRole('link', { name: 'Go home' }))
    expect(await screen.findByText('Home content')).toBeInTheDocument()
  })
})
