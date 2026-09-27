import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The export is written to the repository-root dist/ with a relative base so it
// works from an IPFS gateway subpath or any static host without rewrites.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    target: 'es2022',
  },
})
