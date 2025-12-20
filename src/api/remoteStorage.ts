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

/**
 * Storage backend info (public, without credentials)
 */
export interface StorageBackendInfo {
  id: string;
  /** Backend type (e.g., "s3") */
  type: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  /** Public config without secrets (endpoint, bucket, region) */
  config?: S3PublicConfig;
}

/**
 * S3-compatible backend configuration
 */
export interface S3Config {
  /** Custom endpoint URL (for non-AWS S3-compatible services) */
  endpoint?: string;
  /** AWS region or custom region name */
  region: string;
  /** Bucket name */
  bucket: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Use path-style URLs instead of virtual-hosted-style */
  pathStyle?: boolean;
}

/**
 * Request to add a new storage backend
 */
export interface AddBackendRequest {
  /** Display name for the backend */
  name: string;
  /** Backend type (currently only "s3") */
  type: "s3";
  /** Configuration (structure depends on type) */
  config: S3Config | Record<string, unknown>;
}

/**
 * Request to update a storage backend
 * Only provided fields are updated. Credentials are preserved if not provided.
 */
export interface UpdateBackendRequest {
  /** Backend ID to update */
  backendId: string;
  /** New display name (optional) */
  name?: string;
  /** New configuration (optional) - only non-empty fields are updated */
  config?: Partial<S3Config> | Record<string, unknown>;
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
 * Remote Storage API for S3-compatible (and future WebDAV, FTP) backends.
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
      backendId,
      key,
      data: base64,
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
      { backendId, key }
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
      backendId,
      key,
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
      { backendId, prefix }
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
   * Add a new storage backend
   * @param request - Backend configuration
   * @returns Created backend info
   */
  async add(request: AddBackendRequest): Promise<StorageBackendInfo> {
    return this.client.request<StorageBackendInfo, AddBackendRequest>(
      REMOTE_STORAGE_COMMANDS.addBackend,
      request
    );
  }

  /**
   * Update a storage backend
   * Only provided fields are updated. Credentials are preserved if not provided.
   * @param request - Update request with backendId and fields to update
   * @returns Updated backend info
   */
  async update(request: UpdateBackendRequest): Promise<StorageBackendInfo> {
    return this.client.request<StorageBackendInfo, UpdateBackendRequest>(
      REMOTE_STORAGE_COMMANDS.updateBackend,
      request
    );
  }

  /**
   * Remove a storage backend
   * @param backendId - Backend ID to remove
   */
  async remove(backendId: string): Promise<void> {
    await this.client.request(REMOTE_STORAGE_COMMANDS.removeBackend, {
      backendId,
    });
  }

  /**
   * Test connection to a storage backend
   * @param backendId - Backend ID to test
   */
  async test(backendId: string): Promise<void> {
    await this.client.request(REMOTE_STORAGE_COMMANDS.testBackend, {
      backendId,
    });
  }
}
