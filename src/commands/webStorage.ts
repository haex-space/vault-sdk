/**
 * Web Storage Commands
 *
 * Commands for extension local storage (key-value, similar to localStorage).
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_web_storage_<action>`
 */

export const WEB_STORAGE_COMMANDS = {
  /** Get item from storage */
  getItem: "extension_web_storage_get_item",
  /** Set item in storage */
  setItem: "extension_web_storage_set_item",
  /** Remove item from storage */
  removeItem: "extension_web_storage_remove_item",
  /** Clear all storage */
  clear: "extension_web_storage_clear",
  /** Get all storage keys */
  keys: "extension_web_storage_keys",
} as const;

export type WebStorageCommand = (typeof WEB_STORAGE_COMMANDS)[keyof typeof WEB_STORAGE_COMMANDS];
