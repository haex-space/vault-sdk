/**
 * Database Commands
 *
 * Commands for extension database operations.
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Current naming: `webview_extension_db_<action>` (legacy)
 * Target naming: `extension_database_<action>` (unified)
 */

export const DATABASE_COMMANDS = {
  /** Execute a SELECT query */
  query: "extension_database_query",
  /** Execute INSERT/UPDATE/DELETE statement */
  execute: "extension_database_execute",
  /** Execute multiple statements in a transaction */
  transaction: "extension_database_transaction",
  /** Register and apply database migrations */
  registerMigrations: "extension_database_register_migrations",
} as const;

export type DatabaseCommand = (typeof DATABASE_COMMANDS)[keyof typeof DATABASE_COMMANDS];
