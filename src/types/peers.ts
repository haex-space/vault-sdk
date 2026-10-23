/**
 * Types of peer channels (holzi spec 057, `contracts/bridge.md` and `contracts/sdk.md`): channels
 * between frames of the same extension on devices of different vaults.
 */

/** Who may join a lobby by its code: only the host's contacts, or anyone holding the code. */
export type PeerVisibility = "contacts" | "public";

/**
 * The outcome of an invitation (`peers:invite-status`), exactly once per invitation, on the
 * inviting side.
 */
export interface PeerInviteStatus {
  inviteId: string;
  status: "accepted" | "declined" | "not-installed" | "unreachable" | "expired";
  /** Only with `accepted`: the channel to the invited device. */
  channelId?: string;
  /** Only with `unreachable`: ask the contact to share a current card. */
  hint?: "share_current_card";
}

/**
 * A channel opened by an invitation the user accepted in holzi's prompt (`peers:channel-opened`),
 * on the invited side.
 */
export interface PeerChannelOpened {
  channelId: string;
  origin: "invitation";
  inviteId: string;
  from: {
    /** Only when the extension's `contacts` permission covers this contact. */
    contactId?: string;
    /** The name on the other vault's card, not the display name of the address book. */
    name: string;
  };
  /** The JSON the inviting extension sent with the invitation. */
  payload: unknown;
}

/** A device that joined one of this device's lobbies by code (`peers:joined`), on the host. */
export interface PeerJoined {
  lobbyId: string;
  channelId: string;
  /** Chosen by the joining user and unchecked. */
  displayName: string;
  /** `true` when the joining device belongs to a contact. */
  verified: boolean;
  /** Only when the extension's `contacts` permission covers this contact. */
  contactId?: string;
  /** The JSON the joining extension sent with the join. */
  payload: unknown;
}

/** A message on a channel (`peers:message`), with its data decoded from Base64. */
export interface PeerMessage {
  channelId: string;
  data: Uint8Array;
  reliable: boolean;
}

/**
 * The end of a channel (`peers:channel-closed`): `closed` by either side, `lost` when a reliable
 * message could not be delivered, `timeout` when the other side stopped answering.
 */
export interface PeerChannelClosed {
  channelId: string;
  reason: "closed" | "lost" | "timeout";
}

/** The events of `client.peers.on`, by their name without the `peers:` prefix. */
export interface PeerEventMap {
  "invite-status": PeerInviteStatus;
  "channel-opened": PeerChannelOpened;
  joined: PeerJoined;
  message: PeerMessage;
  "channel-closed": PeerChannelClosed;
}

export type PeerEventType = keyof PeerEventMap;

/** The `details.reason` of a host error of a peers method. */
export type PeerErrorReason =
  | "contact_unknown"
  | "invite_not_open"
  | "channel_unknown"
  | "channel_closed"
  | "lobby_closed"
  | "not_admitted"
  | "too_large"
  | "limit"
  | "network_unavailable"
  | "invalid_input";
