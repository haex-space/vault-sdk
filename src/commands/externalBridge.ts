/**
 * External Bridge Commands
 *
 * Commands for the external bridge (browser extension communication).
 *
 * Naming convention: `external_bridge_<action>`
 */

export const EXTERNAL_BRIDGE_COMMANDS = {
  // Response handling (called by extensions)
  /** Respond to an external request */
  respond: "external_bridge_respond",

  // Bridge server management
  /** Start the external bridge server */
  start: "external_bridge_start",
  /** Stop the external bridge server */
  stop: "external_bridge_stop",
  /** Get bridge server status */
  getStatus: "external_bridge_get_status",

  // Client authorization (unified API with remember flag)
  /** Allow a client connection */
  clientAllow: "external_bridge_client_allow",
  /** Block a client connection */
  clientBlock: "external_bridge_client_block",

  // Authorized clients management (permanent - stored in database)
  /** Get list of authorized clients */
  getAuthorizedClients: "external_bridge_get_authorized_clients",
  /** Revoke client authorization */
  revokeClient: "external_bridge_revoke_client",

  // Session-based authorizations (temporary - cleared when haex-vault restarts)
  /** Get session authorizations */
  getSessionAuthorizations: "external_bridge_get_session_authorizations",
  /** Revoke session authorization */
  revokeSessionAuthorization: "external_bridge_revoke_session_authorization",

  // Blocked clients management
  /** Get list of blocked clients */
  getBlockedClients: "external_bridge_get_blocked_clients",
  /** Unblock a client */
  unblockClient: "external_bridge_unblock_client",
  /** Check if client is blocked */
  isClientBlocked: "external_bridge_is_client_blocked",

  // Pending authorizations
  /** Get pending authorization requests */
  getPendingAuthorizations: "external_bridge_get_pending_authorizations",
} as const;

export type ExternalBridgeCommand = (typeof EXTERNAL_BRIDGE_COMMANDS)[keyof typeof EXTERNAL_BRIDGE_COMMANDS];
