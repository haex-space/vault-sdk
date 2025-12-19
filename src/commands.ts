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
    // Generic filesystem operations (no webview_ prefix because they're global)
    // Permission checks happen in the message handler layer
    readFile: "filesystem_read_file",
    writeFile: "filesystem_write_file",
    readDir: "filesystem_read_dir",
    mkdir: "filesystem_mkdir",
    remove: "filesystem_remove",
    exists: "filesystem_exists",
    stat: "filesystem_stat",
    selectFolder: "filesystem_select_folder",
    selectFile: "filesystem_select_file",
    rename: "filesystem_rename",
    copy: "filesystem_copy",
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
    updateBackend: "storage_update_backend",
    removeBackend: "storage_remove_backend",
    testBackend: "storage_test_backend",
    // Storage Operations
    upload: "storage_upload",
    download: "storage_download",
    delete: "storage_delete",
    list: "storage_list",
  },

  // Extension Remote Storage commands (with permission checks)
  // These commands require publicKey and name to identify the extension
  // and validate filesync permissions before executing storage operations.
  extensionRemoteStorage: {
    listBackends: "extension_remote_storage_list_backends",
    addBackend: "extension_remote_storage_add_backend",
    updateBackend: "extension_remote_storage_update_backend",
    removeBackend: "extension_remote_storage_remove_backend",
    testBackend: "extension_remote_storage_test_backend",
    upload: "extension_remote_storage_upload",
    download: "extension_remote_storage_download",
    delete: "extension_remote_storage_delete",
    list: "extension_remote_storage_list",
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
  | (typeof TAURI_COMMANDS.extensionRemoteStorage)[keyof typeof TAURI_COMMANDS.extensionRemoteStorage];
