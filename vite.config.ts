/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the site works from any path (Static Web Apps, a subfolder, or a file share).
  base: './',
  plugins: [react()],
  // exceljs is split into its own chunk and only loaded when someone exports a workbook.
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ['src/**/*.test.ts'] },
})
