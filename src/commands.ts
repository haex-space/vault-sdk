/**
 * Tauri Command Names
 *
 * Central definition of all Tauri invoke command names.
 * These must match the #[tauri::command] function names in Rust.
 */

export const TAURI_COMMANDS = {
  database: {
    query: "webview_extension_db_query",
    execute: "webview_extension_db_execute",
    registerMigrations: "webview_extension_db_register_migrations",
  },

  permissions: {
    checkWeb: "webview_extension_check_web_permission",
    checkDatabase: "webview_extension_check_database_permission",
    checkFilesystem: "webview_extension_check_filesystem_permission",
  },

  web: {
    open: "webview_extension_web_open",
    fetch: "webview_extension_web_request",
  },

  filesystem: {
    saveFile: "webview_extension_fs_save_file",
    openFile: "webview_extension_fs_open_file",
    showImage: "webview_extension_fs_show_image",
  },

  external: {
    // Response handling (called by extensions running in WebView)
    respond: "webview_extension_external_respond",

    // Bridge server management
    bridgeStart: "external_bridge_start",
    bridgeStop: "external_bridge_stop",
    bridgeGetStatus: "external_bridge_get_status",

    // Client authorization (unified API with remember flag)
    clientAllow: "external_client_allow",
    clientBlock: "external_client_block",

    // Authorized clients management (permanent - stored in database)
    getAuthorizedClients: "external_get_authorized_clients",
    revokeClient: "external_revoke_client",

    // Session-based authorizations (temporary - cleared when haex-vault restarts)
    getSessionAuthorizations: "external_get_session_authorizations",
    revokeSessionAuthorization: "external_revoke_session_authorization",

    // Blocked clients management
    getBlockedClients: "external_get_blocked_clients",
    unblockClient: "external_unblock_client",
    isClientBlocked: "external_is_client_blocked",

    // Pending authorizations
    getPendingAuthorizations: "external_get_pending_authorizations",
  },

  extension: {
    getInfo: "webview_extension_get_info",
    getContext: "webview_extension_context_get",
  },

  storage: {
    // Backend Management (generic, shared by all extensions)
    // These commands don't use webview_ prefix because storage backends are global,
    // not extension-specific. All extensions share the same storage backends.
    listBackends: "storage_list_backends",
    addBackend: "storage_add_backend",
    removeBackend: "storage_remove_backend",
    testBackend: "storage_test_backend",
    // Storage Operations
    upload: "storage_upload",
    download: "storage_download",
    delete: "storage_delete",
    list: "storage_list",
  },

  filesync: {
    // Spaces (webview_* commands extract extension info from WebviewWindow)
    listSpaces: "webview_filesync_list_spaces",
    createSpace: "webview_filesync_create_space",
    deleteSpace: "webview_filesync_delete_space",

    // Files
    listFiles: "webview_filesync_list_files",
    getFile: "webview_filesync_get_file",
    uploadFile: "webview_filesync_upload_file",
    downloadFile: "webview_filesync_download_file",
    deleteFile: "webview_filesync_delete_file",

    // Backends
    listBackends: "webview_filesync_list_backends",
    addBackend: "webview_filesync_add_backend",
    removeBackend: "webview_filesync_remove_backend",
    testBackend: "webview_filesync_test_backend",

    // Sync Rules
    listSyncRules: "webview_filesync_list_sync_rules",
    addSyncRule: "webview_filesync_add_sync_rule",
    updateSyncRule: "webview_filesync_update_sync_rule",
    removeSyncRule: "webview_filesync_remove_sync_rule",

    // Sync Operations
    getSyncStatus: "webview_filesync_get_sync_status",
    triggerSync: "webview_filesync_trigger_sync",
    pauseSync: "webview_filesync_pause_sync",
    resumeSync: "webview_filesync_resume_sync",

    // Conflict Resolution
    resolveConflict: "webview_filesync_resolve_conflict",

    // UI Helpers (selectFolder doesn't need extension info)
    selectFolder: "filesync_select_folder",
    scanLocal: "webview_filesync_scan_local",

    // Sync Queue
    addToQueue: "webview_filesync_add_to_queue",
    getQueue: "webview_filesync_get_queue",
    getQueueSummary: "webview_filesync_get_queue_summary",
    startQueueEntry: "webview_filesync_start_queue_entry",
    completeQueueEntry: "webview_filesync_complete_queue_entry",
    failQueueEntry: "webview_filesync_fail_queue_entry",
    retryFailedQueue: "webview_filesync_retry_failed_queue",
    removeQueueEntry: "webview_filesync_remove_queue_entry",
    clearQueue: "webview_filesync_clear_queue",
    recoverQueue: "webview_filesync_recover_queue",
  },

} as const;

// Type helper to extract command string literals
export type TauriCommand =
  | (typeof TAURI_COMMANDS.database)[keyof typeof TAURI_COMMANDS.database]
  | (typeof TAURI_COMMANDS.permissions)[keyof typeof TAURI_COMMANDS.permissions]
  | (typeof TAURI_COMMANDS.web)[keyof typeof TAURI_COMMANDS.web]
  | (typeof TAURI_COMMANDS.filesystem)[keyof typeof TAURI_COMMANDS.filesystem]
  | (typeof TAURI_COMMANDS.external)[keyof typeof TAURI_COMMANDS.external]
  | (typeof TAURI_COMMANDS.extension)[keyof typeof TAURI_COMMANDS.extension]
  | (typeof TAURI_COMMANDS.storage)[keyof typeof TAURI_COMMANDS.storage]
  | (typeof TAURI_COMMANDS.filesync)[keyof typeof TAURI_COMMANDS.filesync];
