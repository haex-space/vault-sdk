/**
 * HaexSpace Extension Polyfills
 *
 * Auto-initializing polyfills for localStorage, cookies, and history API
 * that work around restrictions in custom protocol contexts (haex-extension://)
 *
 * These polyfills are automatically installed when you import the SDK:
 *
 * ```typescript
 * import { createHaexVaultSdk } from '@haex-space/vault-sdk';
 * // Polyfills are active!
 * ```
 *
 * You can also install them manually:
 *
 * ```typescript
 * import { installPolyfills } from '@haex-space/vault-sdk/polyfills';
 * installPolyfills();
 * ```
 */

import { installLocalStoragePolyfill, installSessionStoragePolyfill } from './localStorage';
import { installCookiePolyfill } from './cookies';
import { installHistoryPolyfill } from './history';
import { installDebugDiagnostics } from './debug';

export { installLocalStoragePolyfill, installSessionStoragePolyfill } from './localStorage';
export { installCookiePolyfill } from './cookies';
export { installHistoryPolyfill } from './history';
export { installBaseTag } from './baseTag'; // Export for backwards compatibility, but not used in auto-install
export { installConsoleForwarding } from './consoleForwarding';
export { installDebugDiagnostics } from './debug';

/**
 * Install all HaexSpace polyfills
 *
 * This function is called automatically when the SDK is imported.
 * You usually don't need to call this manually.
 */
export function installPolyfills(): void {
  if (typeof window === 'undefined') {
    return; // Skip in server-side environments
  }

  // Install localStorage and sessionStorage polyfills immediately
  // These need to be available before any app code runs
  installLocalStoragePolyfill();
  installSessionStoragePolyfill();

  // Install cookie polyfill immediately
  installCookiePolyfill();

  // Install history polyfill (waits for DOM ready internally)
  installHistoryPolyfill();

  // Note: Base tag is injected at build-time by Vite plugin, no runtime setup needed
  // Runtime base tag setup is disabled to prevent conflicts

  // Note: Console forwarding is installed by HaexVaultSdk when debug mode is enabled

  // Run debug diagnostics (which handles its own logging)
  installDebugDiagnostics();
}

// Auto-install polyfills when this module is imported
// This ensures extensions work out of the box without manual setup
if (typeof window !== 'undefined') {
  installPolyfills();
}
