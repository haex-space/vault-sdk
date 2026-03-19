/**
 * Shell Commands
 *
 * Commands for shell/PTY operations.
 * Naming convention: `extension_shell_<action>`
 */

export const SHELL_COMMANDS = {
  /** List available shell environments (no permission required) */
  listAvailable: "extension_shell_list_available",
  /** Create a new PTY shell session */
  create: "extension_shell_create",
  /** Write data to a shell session's stdin */
  write: "extension_shell_write",
  /** Resize a shell session's terminal */
  resize: "extension_shell_resize",
  /** Close a shell session */
  close: "extension_shell_close",
} as const;
