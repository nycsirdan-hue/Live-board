import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  /*
    Relative assets allow the same Liveboard build to work both at
    its existing Vercel root and beneath /liveboard on Studio125.
  */
  base: "./",
  plugins: [react(), tailwindcss()],
})
