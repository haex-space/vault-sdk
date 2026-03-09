/**
 * Space Commands
 *
 * Commands for managing row-to-space assignments (shared space sync).
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_space_<action>`
 */

export const SPACE_COMMANDS = {
  /** Bulk assign rows to spaces */
  assign: "extension_space_assign",
  /** Bulk unassign rows from spaces */
  unassign: "extension_space_unassign",
  /** Get space assignments for a table */
  getAssignments: "extension_space_get_assignments",
} as const;

export type SpaceCommand = (typeof SPACE_COMMANDS)[keyof typeof SPACE_COMMANDS];
