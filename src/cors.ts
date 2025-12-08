/**
 * CORS Configuration for HaexSpace Extensions
 * Used by both Vite and Nuxt plugins to ensure consistent CORS headers
 */

/**
 * Standard CORS headers for HaexSpace dev servers
 * Allows extensions to be loaded in custom protocol iframes (haex-extension://)
 */
export const HAEXSPACE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Credentials': 'true',
} as const

/**
 * Apply CORS headers to a Node.js response object
 * Used in Vite middleware
 */
export function applyCorsHeaders(
  res: { setHeader: (name: string, value: string) => void },
  origin?: string
) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Methods'])
  res.setHeader('Access-Control-Allow-Headers', HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Headers'])
  res.setHeader('Access-Control-Allow-Credentials', HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Credentials'])
}

/**
 * Get CORS headers as a plain object
 * Used in Vite/Nuxt config
 */
export function getCorsHeaders(origin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Origin'],
    'Access-Control-Allow-Methods': HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Methods'],
    'Access-Control-Allow-Headers': HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Headers'],
    'Access-Control-Allow-Credentials': HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Credentials'],
  }
}
