/**
 * Acceptance criterion (PLAN Phase 4): the same 20 images give identical top-5 labels in
 * server mode (FastAPI + onnxruntime CPU) and browser mode (onnxruntime-web, WASM).
 *
 * Images: the 12 curated samples (public/samples) + 8 test-split crops from
 * data/processed/test (local only, never committed). Runs once per browser model
 * variant (FP32 and, if present, FP16) and writes test-results/parity.json.
 *
 * FP32 in the browser is the same model as the server: top-5 labels must be identical in
 * order. FP16 is a different (rounded) model: it must give the same top-1 and the same top-5
 * set; order swaps among near-zero runner-up probabilities are reported, not failed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SAMPLES_DIR = path.join(ROOT, 'frontend', 'public', 'samples')
const TEST_DIR = path.join(ROOT, 'data', 'processed', 'test')
const API = `http://localhost:${process.env.E2E_BACKEND_PORT ?? 8000}`

interface Img {
  name: string
  file: string
}

function images(): Img[] {
  const samples = readdirSync(SAMPLES_DIR)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => ({ name: `sample/${f}`, file: path.join(SAMPLES_DIR, f) }))
  const crops: Img[] = []
  if (existsSync(TEST_DIR)) {
    // Deterministic spread over classes: the first image of every 10th class.
    const classes = readdirSync(TEST_DIR).sort()
    for (let i = 0; i < classes.length && crops.length < 20 - samples.length; i += 10) {
      const dir = path.join(TEST_DIR, classes[i]!)
      const first = readdirSync(dir)
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        .sort()[0]
      if (first) crops.push({ name: `test/${classes[i]}/${first}`, file: path.join(dir, first) })
    }
  }
  return [...samples, ...crops].slice(0, 20)
}

const VARIANTS = [
  { name: 'fp32', url: '/models/efficientnetv2_s.onnx', strictOrder: true },
  { name: 'fp16', url: '/models/efficientnetv2_s.fp16.onnx', strictOrder: false },
].filter((v) => existsSync(path.join(ROOT, 'models', path.basename(v.url))))

const report: Record<string, unknown> = {}

for (const variant of VARIANTS) {
  test(`browser (${variant.name}, WASM) and server give identical top-5 on 20 images`, async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000)
    const imgs = images()
    expect(imgs.length, 'need 20 images (12 samples + 8 test crops from data/processed/test)').toBe(20)

    // Serve local image bytes to the page under a synthetic path.
    await page.route('**/__parity/**', async (route) => {
      const idx = Number(new URL(route.request().url()).pathname.split('/').pop())
      const img = imgs[idx]!
      await route.fulfill({
        body: readFileSync(img.file),
        contentType: img.file.endsWith('.png') ? 'image/png' : 'image/jpeg',
      })
    })
    await page.goto('/')
    await page.evaluate(async (url) => {
      const m = await import(/* @vite-ignore */ '/src/lib/inference/browser.ts')
      m.configureBrowserModel({ url, ep: 'wasm' })
      await m.prepareBrowserModel()
    }, variant.url)

    const rows = []
    let maxDiff = 0
    let mismatches = 0
    let orderOnly = 0
    for (let i = 0; i < imgs.length; i++) {
      const res = await request.post(`${API}/api/predict`, {
        multipart: {
          file: {
            name: path.basename(imgs[i]!.file),
            mimeType: 'image/jpeg',
            buffer: readFileSync(imgs[i]!.file),
          },
          top_k: '5',
        },
      })
      expect(res.ok()).toBeTruthy()
      const server = (await res.json()) as { predictions: Array<{ label: string; probability: number }> }

      const browser = await page.evaluate(async (idx) => {
        const m = await import(/* @vite-ignore */ '/src/lib/inference/browser.ts')
        const blob = await (await fetch(`/__parity/${idx}`)).blob()
        const r = await new m.BrowserInference().identify(blob)
        return { predictions: r.predictions, backend: r.backend, variant: r.variant, ms: r.inferenceMs }
      }, i)

      const sLabels = server.predictions.map((p) => p.label)
      const bLabels = browser.predictions.map((p: { label: string }) => p.label)
      const same = JSON.stringify(sLabels) === JSON.stringify(bLabels)
      const sameSet = sLabels[0] === bLabels[0] && [...sLabels].sort().join() === [...bLabels].sort().join()
      if (!same && (variant.strictOrder || !sameSet)) mismatches++
      else if (!same) orderOnly++
      const diff = Math.max(
        ...server.predictions.map((p) => {
          const b = browser.predictions.find((q: { label: string }) => q.label === p.label)
          return b ? Math.abs(b.probability - p.probability) : 1
        }),
      )
      maxDiff = Math.max(maxDiff, diff)
      rows.push({
        image: imgs[i]!.name,
        top1: sLabels[0],
        top1_p_server: server.predictions[0]!.probability,
        top1_p_browser: browser.predictions[0]!.probability,
        same_top5: same,
        max_abs_prob_diff: diff,
        browser_ms: Math.round(browser.ms),
        backend: browser.backend,
        ...(same ? {} : { server_top5: sLabels, browser_top5: bLabels }),
      })
    }
    const identical = rows.filter((r) => r.same_top5).length
    report[variant.name] = {
      images: rows.length,
      identical_top5: identical,
      same_top1_and_top5_set: rows.length - mismatches,
      order_only_differences: orderOnly,
      max_abs_prob_diff: maxDiff,
      rows,
    }
    console.log(
      `[parity ${variant.name}] ${identical}/${rows.length} identical top-5 (order-only differences: ${orderOnly}), max |Δp| = ${maxDiff.toExponential(2)}`,
    )
    mkdirSync(path.join(ROOT, 'frontend', 'test-results'), { recursive: true })
    writeFileSync(path.join(ROOT, 'frontend', 'test-results', 'parity.json'), JSON.stringify(report, null, 2))
    expect(
      mismatches,
      JSON.stringify(
        rows.filter((r) => !r.same_top5),
        null,
        2,
      ),
    ).toBe(0)
  })
}
