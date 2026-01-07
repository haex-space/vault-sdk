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
  /** Broadcast event to ALL extension webview windows (host-only, desktop only) */
  webviewBroadcast: "extension_webview_broadcast",
  /** Emit event to all webviews of a SPECIFIC extension (host-only, desktop only) */
  webviewEmit: "extension_webview_emit",
  /** Filter sync tables by extension permissions (returns filtered map) */
  filterSyncTables: "extension_filter_sync_tables",
  /** Emit sync tables to webviews (host-only, desktop only) */
  emitSyncTables: "extension_emit_sync_tables",
} as const;

export type ExtensionCommand = (typeof EXTENSION_COMMANDS)[keyof typeof EXTENSION_COMMANDS];
