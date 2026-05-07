/**
 * CORS Configuration for HaexSpace Extensions
 * Used by both Vite and Nuxt plugins to ensure consistent CORS headers
 */

/**
 * Standard CORS headers for HaexSpace dev servers
 *
 * Note: `Access-Control-Allow-Credentials` is intentionally NOT part of this
 * base constant. Per the CORS spec that header is incompatible with
 * `Access-Control-Allow-Origin: *` — browsers silently drop the response.
 * We only emit the credentials header when a specific (non-wildcard) origin
 * is set at runtime.
 */
export const HAEXSPACE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
} as const

export interface CorsOptions {
  /** If true, include `Access-Control-Allow-Credentials: true`. Requires a concrete origin. */
  credentials?: boolean
}

function isWildcardOrigin(origin: string | undefined): boolean {
  return !origin || origin === '*'
}

/**
 * Apply CORS headers to a Node.js response object
 * Used in Vite middleware
 *
 * @throws if credentials are requested with a wildcard origin
 */
export function applyCorsHeaders(
  res: { setHeader: (name: string, value: string) => void },
  origin?: string,
  options: CorsOptions = {}
) {
  const effectiveOrigin = origin || '*'

  if (options.credentials && isWildcardOrigin(origin)) {
    throw new Error(
      '[@haex-space/vault-sdk] CORS: credentials=true cannot be combined with a wildcard origin. Pass a specific origin.'
    )
  }

  res.setHeader('Access-Control-Allow-Origin', effectiveOrigin)
  res.setHeader('Access-Control-Allow-Methods', HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Methods'])
  res.setHeader('Access-Control-Allow-Headers', HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Headers'])

  if (options.credentials && !isWildcardOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

/**
 * Get CORS headers as a plain object
 * Used in Vite/Nuxt config
 *
 * @throws if credentials are requested with a wildcard origin
 */
export function getCorsHeaders(
  origin?: string,
  options: CorsOptions = {}
): Record<string, string> {
  if (options.credentials && isWildcardOrigin(origin)) {
    throw new Error(
      '[@haex-space/vault-sdk] CORS: credentials=true cannot be combined with a wildcard origin. Pass a specific origin.'
    )
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Origin'],
    'Access-Control-Allow-Methods': HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Methods'],
    'Access-Control-Allow-Headers': HAEXSPACE_CORS_HEADERS['Access-Control-Allow-Headers'],
  }

  if (options.credentials && !isWildcardOrigin(origin)) {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return headers
}
