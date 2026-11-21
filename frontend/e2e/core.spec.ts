import { expect, test } from '@playwright/test'

test('identify a sample → profile with map → Field Guide answer with citations', async ({ page }) => {
  await page.goto('/identify')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Identify an animal/)
  await expect(page.getByTestId('inference-mode').first()).toHaveAttribute('data-mode', 'server')

  await page.getByTestId('sample-red-panda').click()
  const result = page.getByTestId('identify-result')
  await expect(result).toBeVisible()
  await expect(result.getByText('Most likely')).toBeVisible()
  await expect(result.getByRole('link', { name: /^Red panda/ }).first()).toBeVisible()
  await expect(page.getByTestId('inference-ms')).toContainText('ms')

  // Heatmap layer rendered over the photo and the controls enabled.
  const heatmap = page.locator('figure img[aria-hidden="true"]')
  await expect(heatmap).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Heatmap' })).toBeEnabled()

  // Handoff link into the Field Guide carries the species.
  await expect(page.getByRole('link', { name: /Ask the Field Guide about red panda/ })).toHaveAttribute(
    'href',
    /\/ask\?species=red-panda/,
  )

  await page.getByRole('link', { name: 'View species profile' }).click()
  await expect(page).toHaveURL(/\/species\/red-panda$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Red panda')
  await expect(page.getByTestId('iucn-status')).toHaveText('Endangered')
  const map = page.getByTestId('occurrence-map')
  await expect(map).toBeVisible()
  await expect(map).toHaveClass(/leaflet-container/)

  // Back keeps the last identification.
  await page.goBack()
  await expect(page.getByTestId('identify-result')).toBeVisible()
  await page.goForward()

  await page.getByRole('link', { name: 'Ask the Field Guide' }).click()
  await expect(page).toHaveURL(/\/ask\?species=red-panda/)
  await expect(page.getByTestId('chat-context')).toContainText('Red panda')
  const composer = page.getByRole('textbox', { name: 'Your question' })
  await expect(composer).toHaveValue(/red panda/)
  await composer.press('Enter')

  const log = page.getByTestId('chat-log')
  await expect(log.getByText('Retrieval-only answer', { exact: true })).toBeVisible()
  await expect(log.getByText('Sources', { exact: true })).toBeVisible()
  await expect(log.getByRole('link', { name: /Wikipedia: Red panda/ }).first()).toBeVisible()
  await expect(log.locator('a[aria-label^="Source 1"]').first()).toBeVisible()
})

test('species atlas search and filters', async ({ page }) => {
  await page.goto('/species')
  const count = page.getByTestId('atlas-count')
  await expect(count).toHaveText(/Showing 80 of 80/)
  await expect(page.getByTestId('atlas-grid').locator('li')).toHaveCount(80)

  await page.getByRole('searchbox', { name: 'Search' }).fill('panda')
  await expect(count).toHaveText(/Showing 2 of 80/)
  await expect(page).toHaveURL(/q=panda/)

  await page.getByTestId('atlas-status').click()
  await page.getByRole('option', { name: /Endangered \(EN\)/ }).click()
  await expect(count).toHaveText(/Showing 1 of 80/)
  await expect(page.getByTestId('atlas-grid')).toContainText('Red panda')

  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await expect(count).toHaveText(/Showing 80 of 80/)

  await page.getByTestId('atlas-group').click()
  await page.getByRole('option', { name: /^Birds/ }).click()
  await page.getByTestId('atlas-status').click()
  await page.getByRole('option', { name: /Not applicable/ }).click()
  await expect(count).toHaveText(/Showing \d+ of 80/)
  await page.getByRole('searchbox', { name: 'Search' }).fill('zzzz')
  await expect(page.getByText('No classes match')).toBeVisible()
})

test('group profile explains the group and shows the proxy-taxon note', async ({ page }) => {
  await page.goto('/species/otter')
  await expect(page.getByTestId('rank-note')).toContainText('group')
  await expect(page.getByTestId('gbif-note')).toContainText('Mustelidae')
  await expect(page.getByTestId('occurrence-map')).toBeVisible()

  await page.goto('/species/fish')
  await expect(page.getByText('No occurrence map for this class')).toBeVisible()
})
