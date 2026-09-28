import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import siteConfiguration from './scripts/site.json'

export default defineConfig(({ mode }) => ({
  base: process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/` : '/',
  build: {
    sourcemap: mode === 'development',
    minify: mode !== 'development',
  },
  plugins: [react(), tailwindcss(), siteConfigurationPlugin(siteConfiguration)],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 5173),
    strictPort: true,
  },
  preview: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 4173),
    strictPort: true,
  },
}))

type SiteConfiguration = {
  description?: string
  robots?: { index?: boolean }
  accessibility?: { addBypassLinks?: boolean }
}

function siteConfigurationPlugin(config: SiteConfiguration): Plugin {
  const description = config.description ?? ''
  const robotsTxt = config.robots?.index === false ? 'User-agent: *\nDisallow: /\n' : ''

  return {
    name: 'daymark-site-configuration',
    configureServer(server) {
      if (!robotsTxt) return
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/robots.txt') return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(robotsTxt)
      })
    },
    generateBundle() {
      if (robotsTxt) {
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt })
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const tags: HtmlTagDescriptor[] = []
        if (description) {
          tags.push({ tag: 'meta', attrs: { name: 'description', content: description }, injectTo: 'head' })
        }
        if (config.robots?.index === false) {
          tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' })
        }
        return { html, tags }
      },
    },
  }
}
