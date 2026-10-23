/**
 * Peer Commands
 *
 * Commands for channels between frames of the same extension on devices of
 * different vaults (holzi spec 057, `contracts/bridge.md`). Every method needs
 * the `peers` permission (`action` = `connect`, `target` = "*"). There is no
 * command to accept or decline an invitation: that happens only in holzi's
 * own prompt.
 *
 * Naming convention: `extension_peers_<action>`
 */

export const PEER_COMMANDS = {
  /** Invites a contact; the outcome follows as `peers:invite-status` */
  invite: "extension_peers_invite",
  /** Withdraws an open invitation on all devices of the contact */
  inviteCancel: "extension_peers_invite_cancel",
  /** Opens a lobby and returns its join code */
  lobbyOpen: "extension_peers_lobby_open",
  /** Closes a lobby; its code stops working, its channels stay open */
  lobbyClose: "extension_peers_lobby_close",
  /** Joins a lobby by its code; waits at most 15 s for the host */
  join: "extension_peers_join",
  /** Closes a channel of an own lobby and keeps the device out of that lobby */
  remove: "extension_peers_remove",
  /** Sends a fast or a reliable message over a channel */
  send: "extension_peers_send",
  /** Closes a channel on both sides */
  close: "extension_peers_close",
} as const;

export type PeerCommand = (typeof PEER_COMMANDS)[keyof typeof PEER_COMMANDS];
