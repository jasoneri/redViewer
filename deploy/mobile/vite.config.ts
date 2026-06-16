import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: {
    port: 5150,
    strictPort: true,
  },
  preview: {
    port: 5151,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
