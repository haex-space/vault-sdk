/**
 * Sync Server API Types
 *
 * Types for communicating with the haex-sync-server authentication endpoints.
 * Used by haex-vault and extensions that need to interact with the sync server.
 */

// ============================================================================
// Storage Configuration
// ============================================================================

/**
 * S3-compatible storage configuration provided by the sync server.
 *
 * When using the sync server's S3 proxy, the client authenticates with their
 * existing auth token (Bearer token), so accessKeyId and secretAccessKey are
 * not needed.
 *
 * For direct S3 access to providers like AWS S3 or Wasabi, the client would
 * provide their own credentials.
 */
export interface StorageConfig {
  /** S3 endpoint URL (e.g., "https://sync.haex.space/storage/s3") */
  endpoint: string;
  /** User's bucket name (e.g., "storage-{user_id}") */
  bucket: string;
  /** S3 region (usually "auto" for Supabase/proxy) */
  region: string;
  /** Access Key ID - only needed for direct S3 access (AWS, Wasabi, etc.) */
  accessKeyId?: string;
  /** Secret Access Key - only needed for direct S3 access (AWS, Wasabi, etc.) */
  secretAccessKey?: string;
}

// ============================================================================
// Authentication Responses
// ============================================================================

/**
 * User info returned from auth endpoints
 */
export interface AuthUser {
  /** User's unique ID (UUID) */
  id: string;
  /** User's email address */
  email: string;
}

/**
 * Response from POST /auth/login and POST /auth/refresh endpoints.
 *
 * Contains:
 * - Session tokens for vault sync (access_token, refresh_token)
 * - Pre-configured S3 storage settings (storage_config)
 *
 * The access_token is used for both vault sync operations and S3 proxy access.
 * The sync server's S3 proxy validates the token and forwards requests to
 * the underlying storage backend.
 */
export interface LoginResponse {
  /** JWT access token for vault sync and storage operations */
  access_token: string;
  /** Refresh token for obtaining new access tokens */
  refresh_token: string;
  /** Token validity in seconds */
  expires_in: number;
  /** Token expiration timestamp (Unix epoch) */
  expires_at: number;
  /** Authenticated user info */
  user: AuthUser;

  /**
   * Pre-configured S3 storage settings.
   * Contains the proxy endpoint and bucket name for the user's storage.
   */
  storage_config?: StorageConfig;
}

/**
 * Request body for POST /auth/login
 */
export interface LoginRequest {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
}

/**
 * Request body for POST /auth/refresh
 */
export interface RefreshRequest {
  /** Refresh token from previous login/refresh response */
  refresh_token: string;
}

// ============================================================================
// Server Info
// ============================================================================

/**
 * Server health check response from GET /
 * Contains server info and Supabase configuration.
 */
export interface ServerInfo {
  /** Server name (e.g., "haex-sync-server") */
  name: string;
  /** Server version (e.g., "0.2.7") */
  version: string;
  /** Server status (should be "ok") */
  status: string;
  /** Environment (e.g., "development", "production") */
  env: string;
  /** Supabase URL for client initialization */
  supabaseUrl: string;
  /** Supabase anon key for client initialization */
  supabaseAnonKey: string;
}

// ============================================================================
// Error Response
// ============================================================================

/**
 * Error response from sync server endpoints
 */
export interface ErrorResponse {
  /** Error message */
  error: string;
}
