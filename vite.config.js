import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

function fleetCachePlugin() {
  const file = path.resolve(import.meta.dirname, 'public/cl_data/fleet_routes.json')
  return {
    name: 'fleet-cache',
    configureServer(server) {
      server.middlewares.use('/__save_fleet_cache', (req, res, next) => {
        if (req.method !== 'POST') return next()
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks)
            JSON.parse(body.toString('utf8'))
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, body)
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/plain')
            res.end('ok')
          } catch (err) {
            res.statusCode = 400
            res.end(String(err?.message || 'save failed'))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), cesium(), fleetCachePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // 代理 OSRM，避免浏览器 CORS
      '/osrm': {
        target: 'https://router.project-osrm.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/osrm/, ''),
      },
    },
  },
  optimizeDeps: {
    // 预构建 Cesium，处理 urijs / mersenne-twister 等 CJS 默认导出
    include: [
      'cesium',
      'mersenne-twister',
      'urijs',
      'rbush',
      'earcut',
      'bitmap-sdf',
      'grapheme-splitter',
      'autolinker',
      'lerc',
      'kdbush',
      'jsep',
      'dompurify',
      'nosleep.js',
    ],
  },
})
