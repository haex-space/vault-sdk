import type { HaexVaultSdk } from "~/client";
import { ENCRYPTED_FOLDER_COMMANDS } from "~/commands";
import { arrayBufferToBase64, base64ToArrayBuffer } from "~/crypto/vaultKey";

// ============================================================================
// Types
// ============================================================================

/** Access to an encrypted folder: `readWrite` includes `read`. */
export type EncryptedFolderAccess = "read" | "readWrite";

/** The encrypted folder the user chose and granted access to. */
export interface EncryptedFolderChoice {
  /** Identifier of the folder, used in every further call (part of the permission target). */
  folderId: string;
  /** Name of the folder as the user sees it. */
  name: string;
}

/** An entry of a folder inside an encrypted folder, with its decrypted name. */
export interface EncryptedFolderEntry {
  name: string;
  kind: "file" | "folder";
  /** Size of a file's decrypted content in bytes */
  size?: number;
  /** Last modification, in milliseconds since 1970-01-01 UTC */
  modified?: number;
}

/**
 * `details.kind` of a provider error (code {@link HostErrorCode.HTTP}, 2002):
 * the kind of the provider's refusal, never its text.
 */
export type EncryptedFolderProviderErrorKind = "accessDenied" | "network" | "bucketMissing";

// ============================================================================
// Encrypted Folders API
// ============================================================================

/**
 * Encrypted folders in a remote storage.
 *
 * The host encrypts and decrypts: the extension sees names and decrypted
 * bytes only. No function ever returns object keys, keys, sidecar files or
 * the raw bytes stored at the provider.
 *
 * Access is the runtime-only permission kind `encryptedFolder` (target
 * `<storageId>/<folderId>`, actions `read` and `readWrite`). It can never be
 * declared in a manifest: the host refuses such a bundle. The user grants it
 * in {@link EncryptedFoldersAPI.choose}, or the host asks when a call needs it;
 * the SDK waits for the answer (1004) and retries like for every other kind.
 *
 * Errors (`{ code, message, details? }`, see {@link HostErrorCode}):
 * - 1002 access denied, or no `remoteStorage` permission for the storage
 * - 2002 provider error, `details.kind` is an {@link EncryptedFolderProviderErrorKind}
 * - 3001 invalid `path` or unknown `folderId`
 * - 3010 the entry is damaged ({@link HostErrorCode.ENCRYPTED_DATA_DAMAGED})
 * - 7000 limit exceeded (data too large, run time)
 *
 * @example
 * ```typescript
 * const folder = await sdk.encryptedFolders.choose(storageId, "readWrite");
 * if (folder) {
 *   await sdk.encryptedFolders.upload(storageId, folder.folderId, "notes/a.txt",
 *     new TextEncoder().encode("Hello"));
 *   const entries = await sdk.encryptedFolders.list(storageId, folder.folderId, "notes");
 *   const bytes = await sdk.encryptedFolders.download(storageId, folder.folderId, "notes/a.txt");
 * }
 * ```
 */
export class EncryptedFoldersAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Let the user choose one of the storage's encrypted folders and grant
   * access to it. The host shows its own window and waits for the answer.
   * Needs the `remoteStorage` permission for the storage (else 1002 without
   * asking); 1002 as well when the user refuses.
   * @param storageId - Storage the folder lies in
   * @param access - Access the extension asks for
   * @returns The chosen folder, or `null` when the user closed the chooser without choosing
   */
  async choose(
    storageId: string,
    access: EncryptedFolderAccess,
  ): Promise<EncryptedFolderChoice | null> {
    const choice = await this.client.request<EncryptedFolderChoice | null>(
      ENCRYPTED_FOLDER_COMMANDS.choose,
      { request: { storageId, access } },
      // No deadline: the host waits for the user's answer in its window.
      { timeout: null },
    );
    return choice ?? null;
  }

  /**
   * List a folder inside an encrypted folder (permission `read`).
   * @param storageId - Storage the folder lies in
   * @param folderId - Folder from {@link EncryptedFoldersAPI.choose}
   * @param path - Path relative to the encrypted folder; `''` (default) for its root
   * @returns The entries with their decrypted names
   */
  async list(storageId: string, folderId: string, path = ""): Promise<EncryptedFolderEntry[]> {
    const result = await this.client.request<{ entries: EncryptedFolderEntry[] }>(
      ENCRYPTED_FOLDER_COMMANDS.list,
      { request: { storageId, folderId, path } },
    );
    return result.entries;
  }

  /**
   * Download and decrypt a file (permission `read`).
   * @param storageId - Storage the folder lies in
   * @param folderId - Folder from {@link EncryptedFoldersAPI.choose}
   * @param path - Path of the file, relative to the encrypted folder
   * @returns The decrypted content
   */
  async download(storageId: string, folderId: string, path: string): Promise<Uint8Array> {
    const base64 = await this.client.request<string>(
      ENCRYPTED_FOLDER_COMMANDS.download,
      { request: { storageId, folderId, path } },
    );
    return base64ToArrayBuffer(base64);
  }

  /**
   * Encrypt and upload a file (permission `readWrite`). Missing parent
   * folders are created.
   * @param storageId - Storage the folder lies in
   * @param folderId - Folder from {@link EncryptedFoldersAPI.choose}
   * @param path - Path of the file, relative to the encrypted folder
   * @param data - Content of the file
   */
  async upload(storageId: string, folderId: string, path: string, data: Uint8Array): Promise<void> {
    await this.client.request(ENCRYPTED_FOLDER_COMMANDS.upload, {
      request: { storageId, folderId, path, data: arrayBufferToBase64(data) },
    });
  }

  /**
   * Delete a file or folder (permission `readWrite`).
   * @param storageId - Storage the folder lies in
   * @param folderId - Folder from {@link EncryptedFoldersAPI.choose}
   * @param path - Path relative to the encrypted folder
   */
  async delete(storageId: string, folderId: string, path: string): Promise<void> {
    await this.client.request(ENCRYPTED_FOLDER_COMMANDS.delete, {
      request: { storageId, folderId, path },
    });
  }
}
