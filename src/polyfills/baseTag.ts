/**
 * Base Tag Polyfill
 * Dynamically injects <base> tag for SPA routing in custom protocol
 */

// Add type declaration for the global flag
declare global {
  interface Window {
    __HAEXHUB_BASE_TAG_INSTALLING__?: boolean
  }
}

/**
 * Installs the base tag by extracting the base path from window.location
 * Works with haex-extension:// protocol URLs
 */
export function installBaseTag() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  // Check if installation is already in progress (prevents duplicate runs)
  if (window.__HAEXHUB_BASE_TAG_INSTALLING__) {
    console.log('[HaexSpace] Base tag installation already in progress, skipping')
    return
  }

  console.log('[HaexSpace] Base tag installation starting')

  // Check if we're in an iframe (extension context)
  if (window.self === window.top) {
    console.log('[HaexSpace] Not in iframe, skipping base tag')
    return
  }

  // Find existing base tag (placeholder or already set)
  const existingBaseTag = document.querySelector('base#haexhub-base') as HTMLBaseElement | null

  // If base tag already has correct href (not just "/"), skip
  if (existingBaseTag && existingBaseTag.href && existingBaseTag.href !== window.location.origin + '/') {
    console.log('[HaexSpace] Base tag already configured, skipping')
    return
  }

  // Mark as installing to prevent duplicate runs
  window.__HAEXHUB_BASE_TAG_INSTALLING__ = true

  // Extract base path from window.location
  // URL format: haex-extension://{public_key}/{name}/{version}/index.html
  const pathname = window.location.pathname

  // Extract the directory part (everything before the filename)
  // For "/public_key/name/version/index.html" -> "/public_key/name/version/"
  const lastSlashIndex = pathname.lastIndexOf('/')
  const basePath = lastSlashIndex !== -1 ? pathname.substring(0, lastSlashIndex + 1) : '/'

  console.log('[HaexSpace] Extracted base path from location:', basePath)

  if (existingBaseTag) {
    // Update existing placeholder
    existingBaseTag.href = basePath
    console.log(`[HaexSpace] Base tag updated: ${existingBaseTag.href}`)
  } else {
    // Create new base tag (fallback if placeholder wasn't injected)
    const baseTag = document.createElement('base')
    baseTag.id = 'haexhub-base'
    baseTag.href = basePath

    const head = document.head || document.querySelector('head')
    if (head) {
      head.insertBefore(baseTag, head.firstChild)
      console.log(`[HaexSpace] Base tag created: ${baseTag.href}`)
    } else {
      console.warn('[HaexSpace] No <head> found, cannot inject base tag')
    }
  }
}
