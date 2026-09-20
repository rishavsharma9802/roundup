import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Multi-entry MV3 build:
//  - two extension pages (popup / options)
//  - the service worker, emitted as an ES module at assets/background.js
//    (manifest.json declares "type": "module", so static imports are allowed)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // Chrome logs "cross-world extension resource mismatch" warnings for
    // <link rel="modulepreload"> on extension pages. The preloads buy nothing
    // for a local popup, so drop them and keep the error page clean.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        options: 'options.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
