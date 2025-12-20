/**
 * Web Commands
 *
 * Commands for web operations (fetch, open URLs).
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_web_<action>`
 */

export const WEB_COMMANDS = {
  /** Open URL in external browser */
  open: "extension_web_open",
  /** Make HTTP request (bypasses CORS) */
  fetch: "extension_web_fetch",
} as const;

export type WebCommand = (typeof WEB_COMMANDS)[keyof typeof WEB_COMMANDS];
