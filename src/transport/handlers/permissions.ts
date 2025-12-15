/**
 * Permissions Handler
 *
 * Maps permission SDK methods to Tauri invoke commands
 */

import { TAURI_COMMANDS } from "../../commands";
import type { InvokeHandlerMap, PermissionCheckParams } from "./types";

export const permissionsHandlers: InvokeHandlerMap = {
  "permissions.web.check": {
    command: TAURI_COMMANDS.permissions.checkWeb,
    args: (p: PermissionCheckParams) => ({
      url: p.url,
    }),
  },

  "permissions.database.check": {
    command: TAURI_COMMANDS.permissions.checkDatabase,
    args: (p: PermissionCheckParams) => ({
      resource: p.resource,
      operation: p.operation,
    }),
  },

  "permissions.filesystem.check": {
    command: TAURI_COMMANDS.permissions.checkFilesystem,
    args: (p: PermissionCheckParams) => ({
      path: p.path,
      actionStr: p.action,
    }),
  },
};
