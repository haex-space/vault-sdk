/**
 * Remote Storage Commands
 *
 * Commands for remote storage operations (S3-compatible backends).
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_remote_storage_<action>`
 */

export const REMOTE_STORAGE_COMMANDS = {
  // Backend Management
  /** List all storage backends */
  listBackends: "extension_remote_storage_list_backends",
  /** Add a new storage backend */
  addBackend: "extension_remote_storage_add_backend",
  /** Update storage backend configuration */
  updateBackend: "extension_remote_storage_update_backend",
  /** Remove a storage backend */
  removeBackend: "extension_remote_storage_remove_backend",
  /** Test storage backend connection */
  testBackend: "extension_remote_storage_test_backend",

  // Storage Operations
  /** Upload data to storage backend */
  upload: "extension_remote_storage_upload",
  /** Download data from storage backend */
  download: "extension_remote_storage_download",
  /** Delete object from storage backend */
  delete: "extension_remote_storage_delete",
  /** List objects in storage backend */
  list: "extension_remote_storage_list",
} as const;

export type RemoteStorageCommand = (typeof REMOTE_STORAGE_COMMANDS)[keyof typeof REMOTE_STORAGE_COMMANDS];
