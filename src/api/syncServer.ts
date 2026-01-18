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
 * This contains all credentials needed to access the user's storage bucket.
 */
export interface StorageConfig {
  /** S3 endpoint URL (e.g., "https://supabase.haex.space/storage/v1/s3") */
  endpoint: string;
  /** Access Key ID (Supabase project reference) */
  accessKeyId: string;
  /** Secret Access Key (Supabase anon key) */
  secretAccessKey: string;
  /** User's bucket name (e.g., "storage-{user_id}") */
  bucket: string;
  /** S3 region (usually "auto" for Supabase) */
  region: string;
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
 * - Storage-only token for S3 operations (storage_token)
 * - Pre-configured S3 storage settings (storage_config)
 *
 * The storage_token is scoped to only allow S3 storage access.
 * It cannot be used to access vault data or other sensitive resources.
 */
export interface LoginResponse {
  /** JWT access token for vault sync operations */
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
   * Storage-only JWT token for S3 operations.
   * This token is scoped to only allow storage access (scope: "storage").
   * It cannot be used to access vault_keys, sync_changes, or other sensitive data.
   * Only present if SUPABASE_JWT_SECRET is configured on the server.
   */
  storage_token?: string;

  /**
   * Storage token expiration timestamp (Unix epoch).
   * Same as expires_at since both tokens expire at the same time.
   */
  storage_token_expires_at?: number;

  /**
   * Pre-configured S3 storage settings.
   * Contains all credentials needed to access the user's storage bucket.
   * Only present if storage_token is available.
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
