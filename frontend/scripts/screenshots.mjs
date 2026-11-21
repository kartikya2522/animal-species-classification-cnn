/**
 * Full-page review screenshots of the running app (dev server + backend).
 *   npm run dev            # in another terminal (and the backend on :8000)
 *   npm run screenshots -- [outDir] [baseUrl] [--only=name,name]
 * Captures each page at 1280×800 and 1920×1080 in light and dark, including
 * interactive states (identify result, low confidence, chat mid-conversation).
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean)
const outDir = path.resolve(args[0] ?? 'screenshots')
const base = args[1] ?? 'http://localhost:5173'
const LOW_CONFIDENCE_IMAGE = path.resolve(import.meta.dirname, 'fixtures', 'low-confidence.jpg')

/** [name, route, optional action run before the screenshot] */
const pages = [
  ['home', '/'],
  ['identify-empty', '/identify'],
  [
    'identify-result',
    '/identify',
    async (page) => {
      await page.getByTestId('sample-red-panda').click()
      await page.getByTestId('identify-result').waitFor()
      await page.locator('figure img[aria-hidden="true"]').waitFor()
    },
  ],
  [
    'identify-low-confidence',
    '/identify',
    async (page) => {
      await page.locator('input[type=file]').setInputFiles(LOW_CONFIDENCE_IMAGE)
      await page.getByTestId('identify-result').waitFor()
      await page.locator('figure img[aria-hidden="true"]').waitFor()
    },
  ],
  ['atlas', '/species'],
  ['profile-species', '/species/red-panda'],
  ['profile-group', '/species/otter'],
  [
    'field-guide',
    '/ask?species=cheetah&name=Cheetah&from=identify',
    async (page) => {
      const box = page.getByRole('textbox', { name: 'Your question' })
      await box.press('Enter')
      const done = page.locator('[data-testid=chat-log] article[aria-busy="false"]')
      await done.first().waitFor({ timeout: 30_000 })
      await box.fill('What is the difference between a sea lion and a harbor seal?')
      await box.press('Enter')
      await done.nth(1).waitFor({ timeout: 30_000 })
      await page.waitForTimeout(500)
    },
  ],
  ['research', '/research'],
  ['about', '/about'],
  ['ui', '/__ui'],
  ['not-found', '/does-not-exist'],
].filter(([name]) => !only.length || only.includes(name))

const viewports = [
  [1280, 800],
  [1920, 1080],
]
const themes = ['light', 'dark']

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
try {
  for (const [w, h] of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: theme,
        reducedMotion: 'reduce',
      })
      await context.addInitScript((t) => localStorage.setItem('wildlens-theme', t), theme)
      for (const [name, route, act] of pages) {
        if ((name === 'not-found' || name === 'ui') && w !== 1280) continue
        // A fresh page per shot: in-memory state (last result, conversation) starts empty.
        const page = await context.newPage()
        await page.goto(base + route, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        if (act) await act(page)
        // Let lazy images and map tiles load: scroll through the page once.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 80))
          }
          window.scrollTo(0, 0)
        })
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(900)
        // Show the latest turn of a conversation, as a reader would see it.
        await page.evaluate(() => {
          const log = document.querySelector('[data-testid=chat-log]')
          if (log) log.scrollTop = log.scrollHeight
        })
        const file = path.join(outDir, `${name}-${w}-${theme}.png`)
        // The chat page is a full-height app layout: capture the viewport.
        await page.screenshot({ path: file, fullPage: name !== 'field-guide' })
        console.log(file)
        await page.close()
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
}
