import type { HaexVaultSdk } from "~/client";
import { REMOTE_STORAGE_COMMANDS } from "~/commands";
import { arrayBufferToBase64, base64ToArrayBuffer } from "~/crypto/vaultKey";

// ============================================================================
// Types
// ============================================================================

/**
 * S3 config without secrets (for display purposes)
 */
export interface S3PublicConfig {
  /** Endpoint URL (optional) */
  endpoint?: string;
  /** Region */
  region: string;
  /** Bucket name */
  bucket: string;
}

/** The protocol of a storage. */
export type StorageBackendType = "s3" | "webdav" | "sftp";

interface StorageBackendInfoBase {
  id: string;
  /** Name of the storage */
  name: string;
  /** Name of the provider the user gave the connection (e.g., "Hetzner") */
  providerName: string;
}

/**
 * A storage the extension may use, as the host lists it: names only, never
 * credentials, endpoint, host, port, host key or region. An S3 storage names
 * its bucket; a WebDAV or SFTP storage names its folder on the server (empty
 * for the root). Check `type` before reading `bucket` or `folder`.
 */
export type StorageBackendInfo = S3BackendInfo | FolderBackendInfo;

/** An S3 storage, as the host lists it. */
export interface S3BackendInfo extends StorageBackendInfoBase {
  type: "s3";
  /** Bucket of the storage */
  bucket: string;
  /** @deprecated Not sent by hosts that keep credentials to themselves (holzi). */
  enabled?: boolean;
  /** @deprecated Not sent by hosts that keep credentials to themselves (holzi). */
  createdAt?: string;
  /** @deprecated Not sent by hosts that keep credentials to themselves (holzi). */
  config?: S3PublicConfig;
}

/** A WebDAV or SFTP storage, as the host lists it. */
export interface FolderBackendInfo extends StorageBackendInfoBase {
  type: "webdav" | "sftp";
  /** Folder of the storage on the server, without `/` at the start or end; empty for the root */
  folder: string;
}

/** Fields that would carry a login; the host enters it in its own window and refuses them. */
interface NoLogin {
  /** Entered by the host and never accepted in a proposal. */
  username?: never;
  /** Entered by the host and never accepted in a proposal. */
  password?: never;
  /** Entered by the host and never accepted in a proposal. */
  privateKey?: never;
  /** Entered by the host and never accepted in a proposal. */
  passphrase?: never;
  /** Confirmed by the user in the host and never accepted in a proposal. */
  hostKey?: never;
  /** Confirmed by the user in the host and never accepted in a proposal. */
  fingerprint?: never;
}

/**
 * What an extension proposes for a new WebDAV storage. The host asks for a
 * permission for host and port of `url` (the port of the scheme when absent),
 * shows the proposal to the user and asks for the login in its own window.
 */
export interface WebDavProposal extends NoLogin {
  /** Address of the WebDAV server: `https`, or `http` only in the local network */
  url: string;
  /** Folder of the storage on the server; empty for the root */
  folder: string;
}

/**
 * What an extension proposes for a new SFTP storage. The host asks for a
 * permission for `host:port`, shows the server's host key to the user to
 * confirm, and asks for the login in its own window.
 */
export interface SftpProposal extends NoLogin {
  /** Name or IP address of the server, without a scheme */
  host: string;
  /** Port of the server (1–65535); 22 when absent */
  port?: number;
  /** Folder of the storage on the server; empty for the root */
  folder: string;
}

/**
 * What an extension proposes for a new S3 storage. The host shows it to the
 * user and asks for credentials in its own window; an extension never sends
 * or sees them.
 */
export interface S3Proposal {
  /** Custom endpoint URL (for non-AWS S3-compatible services); the host may ask for a permission for its host */
  endpoint?: string;
  /** Region; required unless `sameProviderAs` is given */
  region?: string;
  /** Bucket name */
  bucket: string;
  /** Use path-style URLs instead of virtual-hosted-style */
  pathStyle?: boolean;
  /** Credentials are entered by the host and are never accepted in a proposal. */
  accessKeyId?: never;
  /** Credentials are entered by the host and are never accepted in a proposal. */
  secretAccessKey?: never;
  /** Credentials are entered by the host and are never accepted in a proposal. */
  sessionToken?: never;
}

/**
 * S3-compatible backend configuration with credentials.
 *
 * @deprecated Credentials are entered in the host, never passed by an
 * extension: holzi refuses a request that carries `accessKeyId`,
 * `secretAccessKey` or `sessionToken`. Use {@link S3Proposal}. Removed in the
 * next major version.
 */
export interface S3Config {
  /** Custom endpoint URL (for non-AWS S3-compatible services) */
  endpoint?: string;
  /** AWS region or custom region name */
  region: string;
  /** Bucket name */
  bucket: string;
  /** @deprecated Entered in the host. */
  accessKeyId?: string;
  /** @deprecated Entered in the host. */
  secretAccessKey?: string;
  /** @deprecated Entered in the host. */
  sessionToken?: string;
  /** Use path-style URLs instead of virtual-hosted-style */
  pathStyle?: boolean;
}

interface AddBackendRequestBase {
  /** Display name for the storage */
  name: string;
  /** Backend type */
  type: "s3";
}

interface AddFolderBackendRequestBase {
  /** Display name for the storage */
  name: string;
}

/**
 * Request to add a new storage on a new connection. The host asks the user to
 * confirm it and enters credentials in its own window.
 */
export type AddBackendRequest =
  | (AddBackendRequestBase & {
      /** A credential-free proposal for a new connection; region is required. */
      config: S3Proposal & { region: string };
      /** A new connection cannot reuse an existing provider. */
      sameProviderAs?: never;
    })
  /**
   * Request to add a bucket on an existing connection. Endpoint, region and
   * addressing are taken from the referenced storage.
   */
  | (AddBackendRequestBase & {
      /** With an existing provider, only the bucket may be proposed. */
      config: {
        bucket: string;
        endpoint?: never;
        region?: never;
        pathStyle?: never;
        accessKeyId?: never;
        secretAccessKey?: never;
        sessionToken?: never;
      };
      /** A storage the extension may read. */
      sameProviderAs: string;
    })
  /** Request to add a WebDAV storage on a new connection. */
  | (AddFolderBackendRequestBase & {
      type: "webdav";
      config: WebDavProposal;
      sameProviderAs?: never;
    })
  /** Request to add an SFTP storage on a new connection. */
  | (AddFolderBackendRequestBase & {
      type: "sftp";
      config: SftpProposal;
      sameProviderAs?: never;
    })
  /**
   * Request to add a folder on the connection of an existing WebDAV or SFTP
   * storage of the same type.
   */
  | (AddFolderBackendRequestBase & {
      type: "webdav" | "sftp";
      /** With an existing provider, only the folder may be proposed. */
      config: { folder: string } & NoLogin;
      /** A storage of the same type the extension may read. */
      sameProviderAs: string;
    });

/**
 * Request to change a storage. The host asks the user to confirm it; new
 * credentials are entered only in the host's own window.
 */
export interface UpdateBackendRequest {
  /** Backend ID to update */
  backendId: string;
  /** New display name (optional) */
  name?: string;
  /**
   * Only the bucket (S3) or the folder (WebDAV, SFTP) can be changed through
   * the extension request. Credentials and connection details never cross the
   * bridge.
   */
  config?: {
    bucket?: string;
    folder?: string;
    endpoint?: never;
    region?: never;
    pathStyle?: never;
    accessKeyId?: never;
    secretAccessKey?: never;
    sessionToken?: never;
  };
}

/**
 * Object info from list operation
 */
export interface StorageObjectInfo {
  /** Object key */
  key: string;
  /** Size in bytes */
  size: number;
  /** Last modified timestamp (ISO 8601) */
  lastModified?: string;
}

// ============================================================================
// Remote Storage API
// ============================================================================

/**
 * Remote Storage API for S3-compatible, WebDAV and SFTP backends. Object calls
 * work alike on every type.
 *
 * This API provides access to external storage backends configured centrally
 * in haex-vault. Extensions can upload/download files without CORS issues.
 *
 * @example
 * ```typescript
 * // List available backends
 * const backends = await sdk.remoteStorage.backends.list();
 *
 * // Upload data
 * const data = new TextEncoder().encode("Hello World");
 * await sdk.remoteStorage.upload(backendId, "path/to/file.txt", data);
 *
 * // Download data
 * const downloaded = await sdk.remoteStorage.download(backendId, "path/to/file.txt");
 * ```
 */
export class RemoteStorageAPI {
  public readonly backends: BackendManagement;

  constructor(private client: HaexVaultSdk) {
    this.backends = new BackendManagement(client);
  }

  /**
   * Upload data to a storage backend
   * @param backendId - Backend ID to upload to
   * @param key - Object key (path in the bucket)
   * @param data - Data to upload
   */
  async upload(backendId: string, key: string, data: Uint8Array): Promise<void> {
    const base64 = arrayBufferToBase64(data);
    await this.client.request(REMOTE_STORAGE_COMMANDS.upload, {
      request: { backendId, key, data: base64 },
    });
  }

  /**
   * Download data from a storage backend
   * @param backendId - Backend ID to download from
   * @param key - Object key (path in the bucket)
   * @returns Downloaded data as Uint8Array
   */
  async download(backendId: string, key: string): Promise<Uint8Array> {
    const base64 = await this.client.request<string>(
      REMOTE_STORAGE_COMMANDS.download,
      { request: { backendId, key } }
    );
    return base64ToArrayBuffer(base64);
  }

  /**
   * Delete an object from a storage backend
   * @param backendId - Backend ID
   * @param key - Object key to delete
   */
  async delete(backendId: string, key: string): Promise<void> {
    await this.client.request(REMOTE_STORAGE_COMMANDS.delete, {
      request: { backendId, key },
    });
  }

  /**
   * List objects in a storage backend
   * @param backendId - Backend ID
   * @param prefix - Optional prefix to filter objects
   * @returns List of objects
   */
  async list(backendId: string, prefix?: string): Promise<StorageObjectInfo[]> {
    return this.client.request<StorageObjectInfo[]>(
      REMOTE_STORAGE_COMMANDS.list,
      { request: { backendId, prefix } }
    );
  }
}

/**
 * Backend management operations
 */
class BackendManagement {
  constructor(private client: HaexVaultSdk) {}

  /**
   * List all available storage backends
   */
  async list(): Promise<StorageBackendInfo[]> {
    return this.client.request<StorageBackendInfo[]>(
      REMOTE_STORAGE_COMMANDS.listBackends
    );
  }

  /**
   * Propose a new storage. The host asks the user; credentials are entered
   * only there. Resolves with the new storage, which the extension may then
   * read and write.
   * @param request - The proposal, without credentials
   * @returns Created backend info
   */
  async add(request: AddBackendRequest): Promise<StorageBackendInfo> {
    return this.client.request<StorageBackendInfo>(
      REMOTE_STORAGE_COMMANDS.addBackend,
      { request },
      // No deadline: the host waits for the user's answer in its dialog.
      { timeout: null },
    );
  }

  /**
   * Change a storage after the user confirms it in the host.
   * Only provided fields are updated; new credentials are entered in the host.
   * @param request - Update request with backendId and fields to update
   * @returns Updated backend info
   */
  async update(request: UpdateBackendRequest): Promise<StorageBackendInfo> {
    return this.client.request<StorageBackendInfo>(
      REMOTE_STORAGE_COMMANDS.updateBackend,
      { request },
      // No deadline: the host waits for the user's answer in its dialog.
      { timeout: null },
    );
  }

  /**
   * Remove a storage backend
   * @param backendId - Backend ID to remove
   */
  async remove(backendId: string): Promise<void> {
    // No deadline: the host waits for the user's answer in its dialog.
    await this.client.request(
      REMOTE_STORAGE_COMMANDS.removeBackend,
      { backendId },
      { timeout: null },
    );
  }

  /**
   * Test connection to a storage backend
   * @param backendId - Backend ID to test
   */
  async test(backendId: string): Promise<void> {
    // No deadline: the host waits for the user's answer in its dialog.
    await this.client.request(
      REMOTE_STORAGE_COMMANDS.testBackend,
      { backendId },
      { timeout: null },
    );
  }
}
