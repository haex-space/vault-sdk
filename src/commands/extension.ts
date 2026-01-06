/**
 * Extension Commands
 *
 * Commands for extension info and context.
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_<action>`
 */

export const EXTENSION_COMMANDS = {
  /** Get extension info (manifest, id, etc.) */
  getInfo: "extension_get_info",
  /** Get application context (theme, locale, etc.) */
  getContext: "extension_context_get",
  /** Set application context (host-only, updates stored context for extensions) */
  setContext: "extension_context_set",
  /** Emit event to all extension webview windows (host-only) */
  emitToAll: "extension_emit_to_all",
} as const;

export type ExtensionCommand = (typeof EXTENSION_COMMANDS)[keyof typeof EXTENSION_COMMANDS];
