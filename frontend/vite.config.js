import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build date (DD.MM.YYYY) stamped at build time — shown in the footer.
const d = new Date()
const BUILD_DATE = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_DATE__: JSON.stringify(BUILD_DATE) },
  build: {
    // Wide compatibility for older mobile browsers / in-app webviews (Zalo, Facebook,
    // older Android Chrome, iOS Safari). esbuild transpiles modern syntax (?., ??) down.
    target: ['es2018', 'chrome64', 'safari12', 'firefox60', 'edge79'],
  },
})
