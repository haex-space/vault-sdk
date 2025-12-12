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
import { HAEXSPACE_MESSAGE_TYPES } from '../messages'

/**
 * Get the standalone polyfill code as a string
 * This is used by the Nuxt and Vite plugins to inject polyfills into HTML
 *
 * Note: Base tag is injected statically by the Vite plugin, not at runtime
 */
export function getPolyfillCode(): string {
  // Convert functions to string and wrap in IIFE
  // We need to inject the HAEXSPACE_MESSAGE_TYPES constant since it's used by installDebugDiagnostics
  const iife = `(function() {
  'use strict';

  // Message types constant (injected from HAEXSPACE_MESSAGE_TYPES)
  var HAEXSPACE_MESSAGE_TYPES = ${JSON.stringify(HAEXSPACE_MESSAGE_TYPES)};

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
