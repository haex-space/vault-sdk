/**
 * External Bridge Commands
 *
 * Commands for the external bridge (browser extension communication).
 *
 * Uses two prefixes:
 * - `webview_extension_external_` - WebView-specific (respond to requests)
 * - `external_` - Bridge management commands
 *
 * TODO: Migrate all to `extension_external_bridge_` prefix for consistency.
 */

export const EXTERNAL_BRIDGE_COMMANDS = {
  // Response handling (called by extensions running in WebView)
  /** Respond to an external request */
  respond: "webview_extension_external_respond",

  // Bridge server management
  /** Start the external bridge server */
  bridgeStart: "external_bridge_start",
  /** Stop the external bridge server */
  bridgeStop: "external_bridge_stop",
  /** Get bridge server status */
  bridgeGetStatus: "external_bridge_get_status",

  // Client authorization (unified API with remember flag)
  /** Allow a client connection */
  clientAllow: "external_client_allow",
  /** Block a client connection */
  clientBlock: "external_client_block",

  // Authorized clients management (permanent - stored in database)
  /** Get list of authorized clients */
  getAuthorizedClients: "external_get_authorized_clients",
  /** Revoke client authorization */
  revokeClient: "external_revoke_client",

  // Session-based authorizations (temporary - cleared when haex-vault restarts)
  /** Get session authorizations */
  getSessionAuthorizations: "external_get_session_authorizations",
  /** Revoke session authorization */
  revokeSessionAuthorization: "external_revoke_session_authorization",

  // Blocked clients management
  /** Get list of blocked clients */
  getBlockedClients: "external_get_blocked_clients",
  /** Unblock a client */
  unblockClient: "external_unblock_client",
  /** Check if client is blocked */
  isClientBlocked: "external_is_client_blocked",

  // Pending authorizations
  /** Get pending authorization requests */
  getPendingAuthorizations: "external_get_pending_authorizations",
} as const;

export type ExternalBridgeCommand = (typeof EXTERNAL_BRIDGE_COMMANDS)[keyof typeof EXTERNAL_BRIDGE_COMMANDS];
