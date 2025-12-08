/**
 * Generates standalone polyfill code for HTML injection
 * This wraps the modular polyfills into an IIFE for immediate execution
 */
import {
  installLocalStoragePolyfill,
  installSessionStoragePolyfill,
} from './localStorage'
import { installCookiePolyfill } from './cookies'
import { installHistoryPolyfill } from './history'
import { installDebugDiagnostics } from './debug'

/**
 * Get the standalone polyfill code as a string
 * This is used by the Nuxt and Vite plugins to inject polyfills into HTML
 *
 * Note: Base tag is injected statically by the Vite plugin, not at runtime
 */
export function getPolyfillCode(): string {
  // Convert functions to string and wrap in IIFE
  const iife = `(function() {
  'use strict';

  console.log('[HaexSpace] Storage Polyfill loading immediately');

  // localStorage Polyfill
  (${installLocalStoragePolyfill.toString()})();

  // sessionStorage Polyfill
  (${installSessionStoragePolyfill.toString()})();

  // Cookie Polyfill
  (${installCookiePolyfill.toString()})();

  // History API Polyfill
  (${installHistoryPolyfill.toString()})();

  // Note: Base tag is injected at build-time by Vite plugin, not at runtime

  console.log('[HaexSpace] All polyfills loaded successfully');

  // Debug diagnostics for Android debugging
  (${installDebugDiagnostics.toString()})();
})();`

  return iife
}
