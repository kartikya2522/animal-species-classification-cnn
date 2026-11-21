/**
 * Renders the static brand images into public/ with Playwright's Chromium:
 *   favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png  from public/favicon.svg
 *   og-image.jpg (1200×630): typographic card + the CC0 home-page red panda, credited in the image.
 * Rerun after changing the mark or the copy:  node scripts/make_icons.mjs
 * (needs `npx playwright install chromium` once).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from '@playwright/test'

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const svg = readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8')
// setContent pages have no file:// access, so fonts and the photo are inlined as data URLs.
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`
const fontUrl = (pkg, file) =>
  dataUrl(path.join(ROOT, 'node_modules/@fontsource-variable', pkg, 'files', file), 'font/woff2')

const browser = await chromium.launch()
const page = await browser.newPage()

// Icons. The apple-touch / manifest icons are full-bleed squares (platforms apply their own mask),
// with the mark at ~70% so it survives a circular "maskable" crop.
const icons = [
  { file: 'favicon-32.png', size: 32, bleed: false },
  { file: 'apple-touch-icon.png', size: 180, bleed: true },
  { file: 'icon-192.png', size: 192, bleed: true },
  { file: 'icon-512.png', size: 512, bleed: true },
]
for (const { file, size, bleed } of icons) {
  const mark = bleed
    ? svg
        .replace('<rect width="32" height="32" rx="6" fill="#0F1F17"/>', '')
        .replace('viewBox="0 0 32 32"', 'viewBox="-6 -6 44 44"')
    : svg
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:${bleed ? '#0F1F17' : 'transparent'}">` +
      `<div style="width:${size}px;height:${size}px">${mark.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body></html>`,
  )
  await page.screenshot({ path: path.join(PUBLIC, file), omitBackground: !bleed })
  console.log('wrote', file)
}

// Open Graph / Twitter card.
await page.setViewportSize({ width: 1200, height: 630 })
const photo = dataUrl(path.join(PUBLIC, 'images/hero-red-panda.jpg'), 'image/jpeg')
await page.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: Fraunces; src: url(${fontUrl('fraunces', 'fraunces-latin-opsz-normal.woff2')}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: Inter; src: url(${fontUrl('inter', 'inter-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0 }
  body { width: 1200px; height: 630px; display: grid; grid-template-columns: 560px 640px; background: #0F1F17; color: #F4F1EA; font-family: Inter, sans-serif }
  .text { padding: 72px 56px 56px 72px; display: flex; flex-direction: column }
  .over { font-size: 16px; letter-spacing: .14em; white-space: nowrap; text-transform: uppercase; color: #C8C6BC; display: flex; align-items: center; gap: 16px }
  .over span { width: 40px; height: 2px; background: #C8913A }
  h1 { font-family: Fraunces, serif; font-weight: 500; font-size: 96px; line-height: 1; margin-top: 44px; letter-spacing: -.01em }
  p.lead { font-family: Fraunces, serif; font-size: 34px; line-height: 1.25; margin-top: 28px; color: #E7E3D8 }
  .foot { margin-top: auto; max-width: 432px; font-size: 18px; color: #B9B8AE; line-height: 1.5 }
  figure { position: relative; height: 630px }
  figure img { width: 100%; height: 100%; object-fit: cover; object-position: 40% 50% }
  figcaption { position: absolute; right: 16px; bottom: 14px; font-size: 14px; color: #F4F1EA; background: rgba(15,31,23,.72); padding: 5px 10px; border-radius: 3px }
</style></head><body>
  <div class="text">
    <div class="over"><span></span>Species identification · 80 classes</div>
    <h1>WildLens</h1>
    <p class="lead">See the animal.<br>Understand the model.</p>
    <p class="foot">Photo identification with a class-activation heatmap, a species atlas and a grounded field guide.</p>
  </div>
  <figure><img src="${photo}" alt=""><figcaption>Red panda · Mathias Appel, CC0, via Wikimedia Commons</figcaption></figure>
</body></html>`)
await page.evaluate(async () => {
  await document.fonts.ready
  await Promise.all([...document.images].map((i) => i.decode()))
})
await page.screenshot({ path: path.join(PUBLIC, 'og-image.jpg'), type: 'jpeg', quality: 86 })
console.log('wrote og-image.jpg')
await browser.close()
