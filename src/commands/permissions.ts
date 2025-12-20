/**
 * Permissions Commands
 *
 * Commands for checking extension permissions.
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_permissions_<action>`
 */

export const PERMISSIONS_COMMANDS = {
  /** Check web/fetch permission */
  checkWeb: "extension_permissions_check_web",
  /** Check database permission */
  checkDatabase: "extension_permissions_check_database",
  /** Check filesystem permission */
  checkFilesystem: "extension_permissions_check_filesystem",
} as const;

export type PermissionsCommand = (typeof PERMISSIONS_COMMANDS)[keyof typeof PERMISSIONS_COMMANDS];
