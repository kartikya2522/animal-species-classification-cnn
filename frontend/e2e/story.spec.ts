import { expect, test, type Page } from '@playwright/test'

/** Collects console errors and uncaught page errors for the whole test. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

test('home tells the story and its CTAs navigate', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page).toHaveTitle('WildLens')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('See the animal. Understand the model.')
  for (const name of [
    /Too many photographs/,
    /Animal-80: eighty classes/,
    /From a detection dataset/,
    /Four architectures, one recipe/,
    /A ranked guess/,
    /Try it with your own photograph/,
  ]) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
  }
  await expect(page.getByText('Runs the live demo')).toBeVisible()
  await expect(page.getByText('Best in the study')).toBeVisible()
  await expect(page.getByText('arrives with Phase 5')).toHaveCount(0)

  const cta = page.getByRole('region', { name: /Try it with your own photograph/ })
  for (const [name, url, h1] of [
    ['Identify', /\/identify$/, /Identify an animal/],
    ['Species Atlas', /\/species$/, /./],
    ['Field Guide', /\/ask$/, /./],
  ] as const) {
    await cta.getByRole('link', { name: new RegExp(`^${name}`) }).click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1)
    await page.goBack()
    await expect(cta).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('research compares four models from /api/metrics and opens a figure', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/research')
  await expect(page).toHaveTitle('Research · WildLens')
  const table = page.getByTestId('comparison-table')
  await expect(table.locator('tbody tr')).toHaveCount(4)
  const resnet = table.locator('tr[data-model="resnet50"]')
  await expect(resnet.locator('td[data-col="accuracy"]')).toContainText('0.7992')
  await expect(table.locator('tr[data-model="efficientnetv2_s"] td[data-col="accuracy"]')).toContainText(
    'best',
  )
  await expect(table.locator('tr[data-model="convnext_tiny"] td[data-col="auc"]')).toContainText('—')
  await expect(page.getByText(/ConvNeXt-Tiny, AUC: its run did not compute/)).toBeVisible()

  await expect(page.getByTestId('per-class-table').locator('tbody tr')).toHaveCount(80)
  await expect(page.getByTestId('hardest-classes')).toContainText('Squid')

  const grid = page.getByTestId('figure-grid')
  await grid.scrollIntoViewIfNeeded()
  await grid.getByRole('button', { name: /Open figure: Class distribution/ }).click()
  const box = page.getByTestId('figure-lightbox')
  await expect(box).toBeVisible()
  await expect(box.getByRole('heading', { name: 'Class distribution' })).toBeVisible()
  await expect(box.getByRole('img', { name: 'Class distribution' })).toHaveJSProperty('complete', true)
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
  expect(errors).toEqual([])
})

test('about shows the architecture diagram and the project team', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/about')
  await expect(page).toHaveTitle('About · WildLens')
  const svg = page.getByTestId('architecture-diagram')
  await expect(svg).toBeVisible()
  await expect(svg.locator('title')).toHaveText('WildLens architecture')
  await expect(page.getByRole('heading', { name: 'Data sources and licences' })).toBeVisible()
  const team = page.getByTestId('team-section')
  await expect(team).toBeVisible()
  await expect(team.getByRole('heading', { name: 'Project team' })).toBeVisible()
  await expect(team.getByRole('listitem')).toHaveText([
    'Sameer Kadam',
    'Kartikya Gawali',
    'Yash More',
    'Pratik Bhosale',
  ])

  // The skip link is the first stop and moves focus to the main landmark.
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
  await expect(page.getByRole('link', { name: /Source code/ }).first()).toHaveAttribute('href', /^https:\/\//)
  expect(errors).toEqual([])
})
