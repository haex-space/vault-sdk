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
  FileSyncScanLocalParams,
  FileSyncQueueParams,
} from "./types";

export const filesyncHandlers: InvokeHandlerMap = {
  // ==========================================================================
  // Spaces
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.listSpaces]: {
    command: TAURI_COMMANDS.filesync.listSpaces,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.createSpace]: {
    command: TAURI_COMMANDS.filesync.createSpace,
    args: (p: FileSyncSpaceParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.deleteSpace]: {
    command: TAURI_COMMANDS.filesync.deleteSpace,
    args: (p: FileSyncSpaceParams) => ({ spaceId: p.spaceId }),
  },

  // ==========================================================================
  // Files
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.listFiles]: {
    command: TAURI_COMMANDS.filesync.listFiles,
    args: (p: FileSyncFileParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.getFile]: {
    command: TAURI_COMMANDS.filesync.getFile,
    args: (p: FileSyncFileParams) => ({ fileId: p.fileId }),
  },

  [HAEXTENSION_METHODS.filesync.uploadFile]: {
    command: TAURI_COMMANDS.filesync.uploadFile,
    args: (p: FileSyncFileParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.downloadFile]: {
    command: TAURI_COMMANDS.filesync.downloadFile,
    args: (p: FileSyncFileParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.deleteFile]: {
    command: TAURI_COMMANDS.filesync.deleteFile,
    args: (p: FileSyncFileParams) => ({ fileId: p.fileId }),
  },

  // ==========================================================================
  // Backends
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.listBackends]: {
    command: TAURI_COMMANDS.filesync.listBackends,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.addBackend]: {
    command: TAURI_COMMANDS.filesync.addBackend,
    args: (p: FileSyncBackendParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.removeBackend]: {
    command: TAURI_COMMANDS.filesync.removeBackend,
    args: (p: FileSyncBackendParams) => ({ backendId: p.backendId }),
  },

  [HAEXTENSION_METHODS.filesync.testBackend]: {
    command: TAURI_COMMANDS.filesync.testBackend,
    args: (p: FileSyncBackendParams) => ({ backendId: p.backendId }),
  },

  // ==========================================================================
  // Sync Rules
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.listSyncRules]: {
    command: TAURI_COMMANDS.filesync.listSyncRules,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.addSyncRule]: {
    command: TAURI_COMMANDS.filesync.addSyncRule,
    args: (p: FileSyncRuleParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.updateSyncRule]: {
    command: TAURI_COMMANDS.filesync.updateSyncRule,
    args: (p: FileSyncRuleParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.removeSyncRule]: {
    command: TAURI_COMMANDS.filesync.removeSyncRule,
    args: (p: FileSyncRuleParams) => ({ ruleId: p.ruleId }),
  },

  // ==========================================================================
  // Sync Operations
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.getSyncStatus]: {
    command: TAURI_COMMANDS.filesync.getSyncStatus,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.triggerSync]: {
    command: TAURI_COMMANDS.filesync.triggerSync,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.pauseSync]: {
    command: TAURI_COMMANDS.filesync.pauseSync,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.resumeSync]: {
    command: TAURI_COMMANDS.filesync.resumeSync,
    args: () => ({}),
  },

  // ==========================================================================
  // Conflict Resolution
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.resolveConflict]: {
    command: TAURI_COMMANDS.filesync.resolveConflict,
    args: (p: FileSyncConflictParams) => ({ request: p }),
  },

  // ==========================================================================
  // UI Helpers
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.selectFolder]: {
    command: TAURI_COMMANDS.filesync.selectFolder,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.scanLocal]: {
    command: TAURI_COMMANDS.filesync.scanLocal,
    args: (p: FileSyncScanLocalParams) => ({ request: p }),
  },

  // ==========================================================================
  // Sync Queue
  // ==========================================================================
  [HAEXTENSION_METHODS.filesync.addToQueue]: {
    command: TAURI_COMMANDS.filesync.addToQueue,
    args: (p: FileSyncQueueParams) => ({ request: p }),
  },

  [HAEXTENSION_METHODS.filesync.getQueue]: {
    command: TAURI_COMMANDS.filesync.getQueue,
    args: (p: FileSyncQueueParams) => ({ request: p ?? {} }),
  },

  [HAEXTENSION_METHODS.filesync.getQueueSummary]: {
    command: TAURI_COMMANDS.filesync.getQueueSummary,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.startQueueEntry]: {
    command: TAURI_COMMANDS.filesync.startQueueEntry,
    args: (p: FileSyncQueueParams) => ({ entryId: p.entryId }),
  },

  [HAEXTENSION_METHODS.filesync.completeQueueEntry]: {
    command: TAURI_COMMANDS.filesync.completeQueueEntry,
    args: (p: FileSyncQueueParams) => ({ entryId: p.entryId }),
  },

  [HAEXTENSION_METHODS.filesync.failQueueEntry]: {
    command: TAURI_COMMANDS.filesync.failQueueEntry,
    args: (p: FileSyncQueueParams) => ({ entryId: p.entryId, errorMessage: p.errorMessage }),
  },

  [HAEXTENSION_METHODS.filesync.retryFailedQueue]: {
    command: TAURI_COMMANDS.filesync.retryFailedQueue,
    args: () => ({}),
  },

  [HAEXTENSION_METHODS.filesync.removeQueueEntry]: {
    command: TAURI_COMMANDS.filesync.removeQueueEntry,
    args: (p: FileSyncQueueParams) => ({ entryId: p.entryId }),
  },

  [HAEXTENSION_METHODS.filesync.clearQueue]: {
    command: TAURI_COMMANDS.filesync.clearQueue,
    args: (p: FileSyncQueueParams) => ({ ruleId: p.ruleId }),
  },

  [HAEXTENSION_METHODS.filesync.recoverQueue]: {
    command: TAURI_COMMANDS.filesync.recoverQueue,
    args: () => ({}),
  },
};
