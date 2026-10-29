import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base so the production build can be hosted from any sub-path
// (static hosting, the nginx container, or a sandboxed preview).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
})
