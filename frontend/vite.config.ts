/// <reference types="vitest/config" />
import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

const API_TARGET = process.env.WILDLENS_API_URL ?? 'http://localhost:8000'
const MODELS_DIR = path.resolve(import.meta.dirname, '../models')

/**
 * Browser-inference mode in local dev/preview: serve the gitignored ONNX files from
 * ../models at /models/<name>.onnx (read-only, only `*.onnx` names that exist directly in
 * that directory). Nothing is copied into public/ or dist/, so the model is never committed
 * or bundled; deployed builds point VITE_MODEL_URL at an external host instead.
 */
function serveLocalModels(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0] ?? ''
    const m = /^\/models\/([A-Za-z0-9._-]+\.onnx)$/.exec(url)
    if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) return next()
    const file = path.join(MODELS_DIR, path.basename(m[1] as string))
    let size: number
    try {
      const st = statSync(file)
      if (!st.isFile()) return next()
      size = st.size
    } catch {
      res.statusCode = 404
      res.end(`Model ${m[1]} not found in models/ (see scripts/download_models.sh).`)
      return
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', String(size))
    res.setHeader('Cache-Control', 'no-cache')
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  }
  return {
    name: 'wildlens-serve-local-models',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

export default defineConfig({
  plugins: [react(), serveLocalModels()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // Small committed model metadata (registry, classes, fc weights) used by browser inference.
      '@models': MODELS_DIR,
    },
  },
  // onnxruntime-web locates its .wasm via import.meta.url; pre-bundling would break that.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
    fs: { allow: [import.meta.dirname, MODELS_DIR] },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // The onnxruntime-web chunk (~0.4 MB) is lazy-loaded in browser mode only.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
