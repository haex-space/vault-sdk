/**
 * Tauri Command Names
 *
 * Central definition of all Tauri invoke command names.
 * These must match the #[tauri::command] function names in Rust.
 *
 * ## Naming Convention
 *
 * Commands follow the pattern: `<context>_<module>_<action>`
 *
 * ### Contexts:
 * - `extension_` - Commands called by extensions (permission-checked)
 * - `webview_extension_` - Legacy WebView-specific commands (being migrated to extension_)
 *
 * ### Examples:
 * - `extension_remote_storage_list_backends` - Extension remote storage command
 * - `extension_database_query` - Extension database query
 * - `extension_filesystem_read_file` - Extension filesystem read
 */

export * from "./database";
export * from "./permissions";
export * from "./web";
export * from "./webStorage";
export * from "./filesystem";
export * from "./externalBridge";
export * from "./extension";
export * from "./remoteStorage";
export * from "./localsend";

// Re-export combined TAURI_COMMANDS for backwards compatibility
import { DATABASE_COMMANDS } from "./database";
import { PERMISSIONS_COMMANDS } from "./permissions";
import { WEB_COMMANDS } from "./web";
import { WEB_STORAGE_COMMANDS } from "./webStorage";
import { FILESYSTEM_COMMANDS } from "./filesystem";
import { EXTERNAL_BRIDGE_COMMANDS } from "./externalBridge";
import { EXTENSION_COMMANDS } from "./extension";
import { REMOTE_STORAGE_COMMANDS } from "./remoteStorage";
import { LOCALSEND_COMMANDS } from "./localsend";

export const TAURI_COMMANDS = {
  database: DATABASE_COMMANDS,
  permissions: PERMISSIONS_COMMANDS,
  web: WEB_COMMANDS,
  webStorage: WEB_STORAGE_COMMANDS,
  filesystem: FILESYSTEM_COMMANDS,
  externalBridge: EXTERNAL_BRIDGE_COMMANDS,
  extension: EXTENSION_COMMANDS,
  remoteStorage: REMOTE_STORAGE_COMMANDS,
  localsend: LOCALSEND_COMMANDS,
} as const;

// Type helper to extract command string literals
export type TauriCommand =
  | (typeof DATABASE_COMMANDS)[keyof typeof DATABASE_COMMANDS]
  | (typeof PERMISSIONS_COMMANDS)[keyof typeof PERMISSIONS_COMMANDS]
  | (typeof WEB_COMMANDS)[keyof typeof WEB_COMMANDS]
  | (typeof WEB_STORAGE_COMMANDS)[keyof typeof WEB_STORAGE_COMMANDS]
  | (typeof FILESYSTEM_COMMANDS)[keyof typeof FILESYSTEM_COMMANDS]
  | (typeof EXTERNAL_BRIDGE_COMMANDS)[keyof typeof EXTERNAL_BRIDGE_COMMANDS]
  | (typeof EXTENSION_COMMANDS)[keyof typeof EXTENSION_COMMANDS]
  | (typeof REMOTE_STORAGE_COMMANDS)[keyof typeof REMOTE_STORAGE_COMMANDS]
  | (typeof LOCALSEND_COMMANDS)[keyof typeof LOCALSEND_COMMANDS];
