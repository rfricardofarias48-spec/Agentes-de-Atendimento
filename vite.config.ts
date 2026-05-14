import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'vendor-supabase'
          if (id.includes('lucide-react') || id.includes('@radix-ui')) return 'vendor-ui'
          if (id.includes('react-router-dom') || id.includes('react-dom') || (id.includes('node_modules/react/') && !id.includes('react-dom'))) return 'vendor-react'
        },
      },
    },
  },
})
