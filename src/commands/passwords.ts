/**
 * Passwords Commands
 *
 * Commands for the core passwords vault. Extensions are scoped via
 * permissions (`passwords` resource type, `target` = tag or "*").
 *
 * Naming convention: `extension_password_<action>`
 */

export const PASSWORD_COMMANDS = {
  /** List items (no secrets) within the extension's tag scope */
  list: "extension_password_list",
  /** Read full item including secrets, by id */
  read: "extension_password_read",
  /** Create item — must include >=1 tag in scope */
  create: "extension_password_create",
  /** Update item — keeps >=1 tag in scope */
  update: "extension_password_update",
  /** Delete item — must be in scope */
  delete: "extension_password_delete",
} as const;

export type PasswordCommand = (typeof PASSWORD_COMMANDS)[keyof typeof PASSWORD_COMMANDS];
