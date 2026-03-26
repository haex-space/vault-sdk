/**
 * Filesystem Commands
 *
 * Commands for filesystem operations.
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_filesystem_<action>`
 */

export const FILESYSTEM_COMMANDS = {
  // Dialog commands
  /** Show save file dialog */
  saveFile: "extension_filesystem_save_file",
  /** Show open file dialog */
  openFile: "extension_filesystem_open_file",
  /** Show image in native viewer */
  showImage: "extension_filesystem_show_image",

  // Generic filesystem operations
  /** Read file contents as base64 */
  readFile: "extension_filesystem_read_file",
  /** Write base64 data to file */
  writeFile: "extension_filesystem_write_file",
  /** List directory contents */
  readDir: "extension_filesystem_read_dir",
  /** Create directory */
  mkdir: "extension_filesystem_mkdir",
  /** Remove file or directory */
  remove: "extension_filesystem_remove",
  /** Check if path exists */
  exists: "extension_filesystem_exists",
  /** Get file/directory metadata */
  stat: "extension_filesystem_stat",
  /** Show folder selection dialog */
  selectFolder: "extension_filesystem_select_folder",
  /** Show file selection dialog */
  selectFile: "extension_filesystem_select_file",
  /** Rename file or directory */
  rename: "extension_filesystem_rename",
  /** Copy file or directory */
  copy: "extension_filesystem_copy",

  /** Get well-known system directory paths */
  knownPaths: "extension_filesystem_known_paths",

  // File watcher operations
  /** Start watching a directory for changes */
  watch: "extension_filesystem_watch",
  /** Stop watching a directory */
  unwatch: "extension_filesystem_unwatch",
  /** Check if a directory is being watched */
  isWatching: "extension_filesystem_is_watching",
} as const;

export type FilesystemCommand = (typeof FILESYSTEM_COMMANDS)[keyof typeof FILESYSTEM_COMMANDS];
