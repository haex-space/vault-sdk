/**
 * Central request method name definitions for HaexHub SDK
 *
 * Request Naming Schema: haextension:{subject}:{action}
 *
 * These are used for client.request() calls between extensions and HaexHub
 */

export const HAEXTENSION_METHODS = {
  context: {
    get: 'haextension:context:get',
  },

  database: {
    query: 'haextension:database:query',
    execute: 'haextension:database:execute',
    transaction: 'haextension:database:transaction',
    registerMigrations: 'haextension:database:register-migrations',
  },

  filesystem: {
    saveFile: 'haextension:filesystem:save-file',
    openFile: 'haextension:filesystem:open-file',
    showImage: 'haextension:filesystem:show-image',
  },

  filesync: {
    // Spaces
    listSpaces: 'haextension:filesync:list-spaces',
    createSpace: 'haextension:filesync:create-space',
    deleteSpace: 'haextension:filesync:delete-space',

    // Files
    listFiles: 'haextension:filesync:list-files',
    getFile: 'haextension:filesync:get-file',
    uploadFile: 'haextension:filesync:upload-file',
    downloadFile: 'haextension:filesync:download-file',
    deleteFile: 'haextension:filesync:delete-file',

    // Backends
    listBackends: 'haextension:filesync:list-backends',
    addBackend: 'haextension:filesync:add-backend',
    removeBackend: 'haextension:filesync:remove-backend',
    testBackend: 'haextension:filesync:test-backend',

    // Sync Rules
    listSyncRules: 'haextension:filesync:list-sync-rules',
    addSyncRule: 'haextension:filesync:add-sync-rule',
    updateSyncRule: 'haextension:filesync:update-sync-rule',
    removeSyncRule: 'haextension:filesync:remove-sync-rule',

    // Sync Operations
    getSyncStatus: 'haextension:filesync:get-sync-status',
    triggerSync: 'haextension:filesync:trigger-sync',
    pauseSync: 'haextension:filesync:pause-sync',
    resumeSync: 'haextension:filesync:resume-sync',

    // Conflict Resolution
    resolveConflict: 'haextension:filesync:resolve-conflict',

    // UI Helpers
    selectFolder: 'haextension:filesync:select-folder',
    scanLocal: 'haextension:filesync:scan-local',

    // Sync Queue (persistent upload/download queue)
    addToQueue: 'haextension:filesync:add-to-queue',
    getQueue: 'haextension:filesync:get-queue',
    getQueueSummary: 'haextension:filesync:get-queue-summary',
    startQueueEntry: 'haextension:filesync:start-queue-entry',
    completeQueueEntry: 'haextension:filesync:complete-queue-entry',
    failQueueEntry: 'haextension:filesync:fail-queue-entry',
    retryFailedQueue: 'haextension:filesync:retry-failed-queue',
    removeQueueEntry: 'haextension:filesync:remove-queue-entry',
    clearQueue: 'haextension:filesync:clear-queue',
    recoverQueue: 'haextension:filesync:recover-queue',
  },

  storage: {
    getItem: 'haextension:storage:get-item',
    setItem: 'haextension:storage:set-item',
    removeItem: 'haextension:storage:remove-item',
    clear: 'haextension:storage:clear',
    keys: 'haextension:storage:keys',
  },

  // Remote Storage API (S3, WebDAV, FTP, etc.)
  remoteStorage: {
    // Backend Management
    listBackends: 'haextension:remote-storage:list-backends',
    addBackend: 'haextension:remote-storage:add-backend',
    removeBackend: 'haextension:remote-storage:remove-backend',
    testBackend: 'haextension:remote-storage:test-backend',
    // Storage Operations
    upload: 'haextension:remote-storage:upload',
    download: 'haextension:remote-storage:download',
    delete: 'haextension:remote-storage:delete',
    list: 'haextension:remote-storage:list',
  },

  web: {
    fetch: 'haextension:web:fetch',
  },

  application: {
    open: 'haextension:application:open',
  },
} as const;

// Helper type to extract all string values from nested object
type DeepValues<T> = T extends object
  ? T[keyof T] extends string
    ? T[keyof T]
    : T[keyof T] extends object
    ? DeepValues<T[keyof T]>
    : never
  : never;

export type HaextensionMethod = DeepValues<typeof HAEXTENSION_METHODS>;
