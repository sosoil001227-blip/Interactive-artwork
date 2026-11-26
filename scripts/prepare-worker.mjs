import { fileURLToPath } from 'node:url'
import { build } from 'vite'

// MediaPipe loads WASM with importScripts. Prebundle a classic worker for both
// dev and production: Vite's unbundled dev workers otherwise contain ESM imports.
await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    target: ['chrome79', 'edge79', 'firefox78', 'safari14'],
    outDir: fileURLToPath(new URL('../public/workers/', import.meta.url)),
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('../shared/hand-worker.ts', import.meta.url)),
      name: 'HandTrackingWorker',
      formats: ['iife'],
      fileName: () => 'hand-worker.js',
    },
    minify: true,
  },
})
