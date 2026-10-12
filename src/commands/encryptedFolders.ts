/**
 * Encrypted Folder Commands
 *
 * Commands for encrypted folders in a remote storage. The host encrypts and
 * decrypts; an extension only ever sees names and decrypted bytes.
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `extension_encrypted_folder_<action>`
 */

export const ENCRYPTED_FOLDER_COMMANDS = {
  /** Let the user pick an encrypted folder of a storage and grant access to it */
  choose: "extension_encrypted_folder_choose",
  /** List the entries of a folder inside an encrypted folder */
  list: "extension_encrypted_folder_list",
  /** Download and decrypt a file */
  download: "extension_encrypted_folder_download",
  /** Encrypt and upload a file */
  upload: "extension_encrypted_folder_upload",
  /** Delete a file or folder */
  delete: "extension_encrypted_folder_delete",
} as const;

export type EncryptedFolderCommand =
  (typeof ENCRYPTED_FOLDER_COMMANDS)[keyof typeof ENCRYPTED_FOLDER_COMMANDS];
