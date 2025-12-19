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
    // Generic FS operations (Phase 2)
    readFile: 'haextension:filesystem:read-file',
    writeFile: 'haextension:filesystem:write-file',
    readDir: 'haextension:filesystem:read-dir',
    mkdir: 'haextension:filesystem:mkdir',
    remove: 'haextension:filesystem:remove',
    exists: 'haextension:filesystem:exists',
    stat: 'haextension:filesystem:stat',
    selectFolder: 'haextension:filesystem:select-folder',
    selectFile: 'haextension:filesystem:select-file',
    rename: 'haextension:filesystem:rename',
    copy: 'haextension:filesystem:copy',
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
