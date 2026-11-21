import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against real local servers. Playwright starts (and stops) both unless they are
 * already running: the FastAPI backend on :8000 and the Vite dev server on :5173.
 *   npx playwright install chromium   # once
 *   npm run e2e                       # core flows + browser/server parity
 * Needs models/efficientnetv2_s.onnx; the parity test also uses data/processed/test if present.
 */
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 8000)
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 5173)

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: `.venv/bin/uvicorn app.main:app --port ${BACKEND_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { WILDLENS_API_URL: `http://localhost:${BACKEND_PORT}` },
    },
  ],
})
