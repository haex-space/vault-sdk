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

    sync: {
      // Spaces
      listSpaces: 'haextension:filesystem:sync:list-spaces',
      createSpace: 'haextension:filesystem:sync:create-space',
      deleteSpace: 'haextension:filesystem:sync:delete-space',

      // Files
      listFiles: 'haextension:filesystem:sync:list-files',
      getFile: 'haextension:filesystem:sync:get-file',
      uploadFile: 'haextension:filesystem:sync:upload-file',
      downloadFile: 'haextension:filesystem:sync:download-file',
      deleteFile: 'haextension:filesystem:sync:delete-file',

      // Backends
      listBackends: 'haextension:filesystem:sync:list-backends',
      addBackend: 'haextension:filesystem:sync:add-backend',
      removeBackend: 'haextension:filesystem:sync:remove-backend',
      testBackend: 'haextension:filesystem:sync:test-backend',

      // Sync Rules
      listSyncRules: 'haextension:filesystem:sync:list-sync-rules',
      addSyncRule: 'haextension:filesystem:sync:add-sync-rule',
      updateSyncRule: 'haextension:filesystem:sync:update-sync-rule',
      removeSyncRule: 'haextension:filesystem:sync:remove-sync-rule',

      // Sync Operations
      getSyncStatus: 'haextension:filesystem:sync:get-sync-status',
      triggerSync: 'haextension:filesystem:sync:trigger-sync',
      pauseSync: 'haextension:filesystem:sync:pause-sync',
      resumeSync: 'haextension:filesystem:sync:resume-sync',

      // Conflict Resolution
      resolveConflict: 'haextension:filesystem:sync:resolve-conflict',

      // UI Helpers
      selectFolder: 'haextension:filesystem:sync:select-folder',
      scanLocal: 'haextension:filesystem:sync:scan-local',
    },
  },

  storage: {
    getItem: 'haextension:storage:get-item',
    setItem: 'haextension:storage:set-item',
    removeItem: 'haextension:storage:remove-item',
    clear: 'haextension:storage:clear',
    keys: 'haextension:storage:keys',
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
