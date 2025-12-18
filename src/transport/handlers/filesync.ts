/**
 * FileSync Handler
 *
 * Maps filesync SDK methods to Tauri invoke commands
 */

import { HAEXTENSION_METHODS } from "../../methods";
import { TAURI_COMMANDS } from "../../commands";
import type {
  InvokeHandlerMap,
  FileSyncSpaceParams,
  FileSyncFileParams,
  FileSyncBackendParams,
  FileSyncRuleParams,
  FileSyncConflictParams,
} from "./types";

export const filesyncHandlers: InvokeHandlerMap = {
  // ==========================================================================
  // Spaces
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.listSpaces]: {
    command: TAURI_COMMANDS.filesync.listSpaces,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesystem.sync.createSpace]: {
    command: TAURI_COMMANDS.filesync.createSpace,
    args: (p: FileSyncSpaceParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.deleteSpace]: {
    command: TAURI_COMMANDS.filesync.deleteSpace,
    args: (p: FileSyncSpaceParams) => ({ spaceId: p.spaceId }),
  },

  // ==========================================================================
  // Files
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.listFiles]: {
    command: TAURI_COMMANDS.filesync.listFiles,
    args: (p: FileSyncFileParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.getFile]: {
    command: TAURI_COMMANDS.filesync.getFile,
    args: (p: FileSyncFileParams) => ({ fileId: p.fileId }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.uploadFile]: {
    command: TAURI_COMMANDS.filesync.uploadFile,
    args: (p: FileSyncFileParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.downloadFile]: {
    command: TAURI_COMMANDS.filesync.downloadFile,
    args: (p: FileSyncFileParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.deleteFile]: {
    command: TAURI_COMMANDS.filesync.deleteFile,
    args: (p: FileSyncFileParams) => ({ fileId: p.fileId }),
  },

  // ==========================================================================
  // Backends
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.listBackends]: {
    command: TAURI_COMMANDS.filesync.listBackends,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesystem.sync.addBackend]: {
    command: TAURI_COMMANDS.filesync.addBackend,
    args: (p: FileSyncBackendParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.removeBackend]: {
    command: TAURI_COMMANDS.filesync.removeBackend,
    args: (p: FileSyncBackendParams) => ({ backendId: p.backendId }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.testBackend]: {
    command: TAURI_COMMANDS.filesync.testBackend,
    args: (p: FileSyncBackendParams) => ({ backendId: p.backendId }),
  },

  // ==========================================================================
  // Sync Rules
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.listSyncRules]: {
    command: TAURI_COMMANDS.filesync.listSyncRules,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesystem.sync.addSyncRule]: {
    command: TAURI_COMMANDS.filesync.addSyncRule,
    args: (p: FileSyncRuleParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.updateSyncRule]: {
    command: TAURI_COMMANDS.filesync.updateSyncRule,
    args: (p: FileSyncRuleParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesystem.sync.removeSyncRule]: {
    command: TAURI_COMMANDS.filesync.removeSyncRule,
    args: (p: FileSyncRuleParams) => ({ ruleId: p.ruleId }),
  },

  // ==========================================================================
  // Sync Operations
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.getSyncStatus]: {
    command: TAURI_COMMANDS.filesync.getSyncStatus,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesystem.sync.triggerSync]: {
    command: TAURI_COMMANDS.filesync.triggerSync,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesystem.sync.pauseSync]: {
    command: TAURI_COMMANDS.filesync.pauseSync,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesystem.sync.resumeSync]: {
    command: TAURI_COMMANDS.filesync.resumeSync,
    args: () => ({}),
  },

  // ==========================================================================
  // Conflict Resolution
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.resolveConflict]: {
    command: TAURI_COMMANDS.filesync.resolveConflict,
    args: (p: FileSyncConflictParams) => ({ request: p }),
  },

  // ==========================================================================
  // UI Helpers
  // ==========================================================================
  [HAEXTENSION_METHODS.filesystem.sync.selectFolder]: {
    command: TAURI_COMMANDS.filesync.selectFolder,
    args: () => ({}),
  },
};
