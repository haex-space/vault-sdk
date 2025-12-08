/**
 * Vite Plugin for HaexSpace SDK
 * Automatically injects polyfills into HTML files
 * Works with React, Vue, Svelte, and any other Vite-based project
 */
import type { Plugin } from 'vite'
import { getPolyfillCode } from './polyfills/standalone'
import { applyCorsHeaders } from './cors'

export interface VitePluginOptions {
  /**
   * Enable/disable polyfill injection
   * @default true
   */
  injectPolyfills?: boolean

  /**
   * Configure CORS for dev server
   * @default true
   */
  configureCors?: boolean
}

/**
 * HaexSpace Vite Plugin
 * Injects browser API polyfills for extensions running in custom protocols
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { haexspacePlugin } from '@haex-space/vault-sdk/vite'
 *
 * export default {
 *   plugins: [haexspacePlugin()]
 * }
 * ```
 */
export function haexspacePlugin(options: VitePluginOptions = {}): Plugin {
  const { injectPolyfills = true, configureCors = true } = options

  let polyfillCode: string | null = null

  return {
    name: '@haex-space/vault-sdk',
    enforce: 'post', // Run after other plugins

    configResolved(config) {
      if (injectPolyfills) {
        try {
          // Get polyfill code from modular polyfills
          polyfillCode = getPolyfillCode()
          console.log('✓ [@haex-space/vault-sdk] Polyfills initialized')
        } catch (error) {
          console.error('[@haex-space/vault-sdk] Failed to initialize:', error)
          throw error
        }
      }

      // Log CORS configuration
      if (configureCors && config.command === 'serve') {
        console.log('✓ [@haex-space/vault-sdk] CORS configured for HaexSpace development')
        console.log('  - Allowing all origins (required for custom protocols)')
        console.log('  - Allowing credentials')
      }
    },

    configureServer(server) {
      if (!configureCors) return

      // Add CORS middleware for HaexSpace using shared CORS configuration
      server.middlewares.use((req, res, next) => {
        // Apply CORS headers (allows custom protocols like haex-extension://)
        applyCorsHeaders(res, req.headers.origin)

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        next()
      })
    },

    transformIndexHtml: {
      order: 'pre', // Inject before other transformations
      handler(html: string) {
        if (!injectPolyfills || !polyfillCode) {
          return html
        }

        // Inject polyfill script directly after <head>
        const headPos = html.indexOf('<head>')
        if (headPos === -1) {
          console.warn('[@haex-space/vault-sdk] No <head> tag found in HTML')
          return html
        }

        const insertPos = headPos + 6 // after <head>

        // Inject polyfill only (no base tag needed)
        const polyfillScript = `<script>${polyfillCode}</script>`
        const modifiedHtml = html.slice(0, insertPos) + polyfillScript + html.slice(insertPos)

        console.log('✓ [@haex-space/vault-sdk] Polyfill injected into HTML')

        return modifiedHtml
      }
    }
  }
}

// Default export for convenience
export default haexspacePlugin
