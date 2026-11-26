import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readDevHttps } from './scripts/dev-https.mjs'

export default defineConfig(({ command, isPreview }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '::',
    port: 5174,
    strictPort: true,
    https: command === 'serve' && !isPreview ? readDevHttps() : undefined,
    fs: {
      // Retain Vite's default exclusions and also deny the entire cert directory.
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.certs/**'],
    },
  },
  preview: { host: 'localhost', port: 5174, strictPort: true },
  resolve: { dedupe: ['@mediapipe/tasks-vision'] },
  define: { 'import.meta.env.VITE_EXAMPLE_HUB': 'true' },
  build: {
    // Include older WebViews while retaining native modules and WebGL support.
    target: ['chrome79', 'edge79', 'firefox78', 'safari14'],
    rolldownOptions: {
      input: { home: 'index.html', water: 'example-8/index.html', magic: 'example-9/index.html', jelly: 'example-10/index.html', puppet: 'example-11/index.html', rubber: 'example-12/index.html', veil: 'example-13/index.html', ddr: 'example-14/index.html' },
    },
  },
}))
