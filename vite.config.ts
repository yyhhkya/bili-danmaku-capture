import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'APP_')
  const backendPort = Number(env.APP_PORT ?? 3000) || 3000

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: false,
        },
        '/ws': {
          target: `ws://127.0.0.1:${backendPort}`,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
  }
})
