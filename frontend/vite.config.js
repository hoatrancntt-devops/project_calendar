import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Wide compatibility for older mobile browsers / in-app webviews (Zalo, Facebook,
    // older Android Chrome, iOS Safari). esbuild transpiles modern syntax (?., ??) down.
    target: ['es2018', 'chrome64', 'safari12', 'firefox60', 'edge79'],
  },
})
