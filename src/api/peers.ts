import type { HaexVaultSdk } from "../client";
import { PEER_COMMANDS } from "../commands/peers";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../crypto/vaultKey";
import { PEERS_EVENTS, type PeersEvent } from "../events";
import type { EventCallback } from "../types";
import type {
  PeerErrorReason,
  PeerEventMap,
  PeerEventType,
  PeerVisibility,
} from "../types/peers";

/**
 * The name of each `details.reason` in haex-doom's draft of this API; `limit`,
 * `network_unavailable` and `invalid_input` are new there.
 */
export const PEER_ERROR_KINDS = {
  contact_unknown: "PEER_CONTACT_UNKNOWN",
  invite_not_open: "PEER_INVITE_UNKNOWN",
  channel_unknown: "PEER_CHANNEL_CLOSED",
  channel_closed: "PEER_CHANNEL_CLOSED",
  too_large: "PEER_PAYLOAD_TOO_LARGE",
  lobby_closed: "PEER_LOBBY_CLOSED",
  not_admitted: "PEER_NOT_ALLOWED",
  limit: "PEER_LIMIT",
  network_unavailable: "PEER_NETWORK_UNAVAILABLE",
  invalid_input: "PEER_INVALID_INPUT",
} as const satisfies Record<PeerErrorReason, string>;

export type PeerErrorKind = (typeof PEER_ERROR_KINDS)[PeerErrorReason];

/**
 * A host error of a peers method that names its `details.reason`. `code` stays the host's number
 * (1001, 1002, 3001, 7000, 8001); `not_admitted` shares 1002 with a refused permission, so tell
 * them apart by `reason`. The host's error is kept as `cause`.
 */
export class PeerError extends Error {
  readonly kind: PeerErrorKind;
  /** The host's `details.limit` with `too_large` (bytes) and `limit` (count). */
  readonly limit?: number;

  constructor(
    readonly code: number,
    readonly reason: PeerErrorReason,
    message: string,
    readonly details: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PeerError";
    this.kind = PEER_ERROR_KINDS[reason];
    if (typeof details.limit === "number") this.limit = details.limit;
  }
}

function isPeerErrorReason(value: unknown): value is PeerErrorReason {
  return typeof value === "string" && Object.hasOwn(PEER_ERROR_KINDS, value);
}

/**
 * The host's `{ code, message, details: { reason } }` as a {@link PeerError}; any other error
 * (a permission without reason, a timeout of the SDK) unchanged.
 */
function toPeerError(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return error;
  const { code, message, details } = error as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof code !== "number" || typeof details !== "object" || details === null) return error;
  const reason = (details as { reason?: unknown }).reason;
  if (!isPeerErrorReason(reason)) return error;
  return new PeerError(
    code,
    reason,
    typeof message === "string" ? message : reason,
    details as Record<string, unknown>,
    { cause: error },
  );
}

const EVENT_NAMES: Record<PeerEventType, PeersEvent> = {
  "invite-status": PEERS_EVENTS.INVITE_STATUS,
  "channel-opened": PEERS_EVENTS.CHANNEL_OPENED,
  joined: PEERS_EVENTS.JOINED,
  message: PEERS_EVENTS.MESSAGE,
  "channel-closed": PEERS_EVENTS.CHANNEL_CLOSED,
};

/** The event as the extension gets it, or `undefined` for data that does not fit. */
function decodeEvent<T extends PeerEventType>(type: T, data: unknown): PeerEventMap[T] | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  if (type !== "message") return data as PeerEventMap[T];
  const message = data as { channelId?: unknown; data?: unknown; reliable?: unknown };
  if (typeof message.channelId !== "string" || typeof message.data !== "string") return undefined;
  let decoded: Uint8Array<ArrayBuffer>;
  try {
    decoded = base64ToArrayBuffer(message.data);
  } catch {
    return undefined;
  }
  if (arrayBufferToBase64(decoded) !== message.data) return undefined;
  return {
    channelId: message.channelId,
    data: decoded,
    reliable: message.reliable === true,
  } as PeerEventMap[T];
}

/**
 * Channels between frames of this extension on devices of different vaults (holzi spec 057).
 * Needs the `peers` permission (`{ target: "*", action: "connect" }`); inviting a contact also
 * needs `contacts` read access to that contact.
 *
 * A channel starts in one of two ways. An invitation goes to all devices of a contact; the user
 * accepts or declines it only in holzi's own prompt, so the SDK has no accept or decline. The
 * invited side gets `channel-opened`, the inviting side `invite-status`. A lobby hands out an
 * opaque join code (`haex-vault:join:…`); a device that joins with it gets the channel from
 * {@link PeersAPI.joinAsync}, the host gets `joined`.
 *
 * Errors with a `details.reason` reject as {@link PeerError}; others reject unchanged.
 */
export class PeersAPI {
  /** Largest fast message (`reliable: false`) in bytes. */
  readonly MAX_FAST_BYTES = 1024;
  /** Largest reliable message in bytes. */
  readonly MAX_RELIABLE_BYTES = 65536;
  /** Largest `payload` of an invitation or a join, as JSON, in bytes. */
  readonly MAX_PAYLOAD_BYTES = 4096;

  constructor(private client: HaexVaultSdk) {}

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    try {
      return await this.client.request<T>(method, params);
    } catch (error) {
      throw toPeerError(error);
    }
  }

  /** Invites a contact; the outcome follows as `invite-status` with this `inviteId`. */
  async inviteAsync(contactId: string, payload: unknown): Promise<{ inviteId: string }> {
    const answer = await this.call<{ inviteId: string }>(PEER_COMMANDS.invite, { contactId, payload });
    return { inviteId: answer.inviteId };
  }

  /** Withdraws an open invitation on all devices of the contact; no `invite-status` follows. */
  async cancelInviteAsync(inviteId: string): Promise<void> {
    await this.call(PEER_COMMANDS.inviteCancel, { inviteId });
  }

  /**
   * Opens a lobby; `lobbyId` is 1–64 characters of `[A-Za-z0-9._-]`. The join code is opaque:
   * hand it on as it is.
   */
  async openLobbyAsync(lobbyId: string, visibility: PeerVisibility): Promise<{ joinCode: string }> {
    const answer = await this.call<{ joinCode: string }>(PEER_COMMANDS.lobbyOpen, { lobbyId, visibility });
    return { joinCode: answer.joinCode };
  }

  /** Closes a lobby: its code stops working, its channels stay open. An unknown lobby is fine. */
  async closeLobbyAsync(lobbyId: string): Promise<void> {
    await this.call(PEER_COMMANDS.lobbyClose, { lobbyId });
  }

  /**
   * Joins a lobby by its code with a self-chosen `displayName` (1–64 characters). The host
   * answers within 15 s; a lobby that cannot be joined for any reason rejects as `lobby_closed`.
   */
  async joinAsync(
    joinCode: string,
    displayName: string,
    payload: unknown,
  ): Promise<{ channelId: string; lobbyId: string }> {
    const answer = await this.call<{ channelId: string; lobbyId: string }>(PEER_COMMANDS.join, {
      joinCode,
      displayName,
      payload,
    });
    return { channelId: answer.channelId, lobbyId: answer.lobbyId };
  }

  /** Closes a channel of an own lobby and keeps that device (and vault) out of the lobby. */
  async removeAsync(channelId: string): Promise<void> {
    await this.call(PEER_COMMANDS.remove, { channelId });
  }

  /**
   * Sends bytes over a channel: fast (default, at most {@link MAX_FAST_BYTES}, may be lost) or
   * `reliable` (at most {@link MAX_RELIABLE_BYTES}, in order; 16 may wait per channel).
   */
  async sendAsync(channelId: string, data: Uint8Array, options: { reliable?: boolean } = {}): Promise<void> {
    await this.call(PEER_COMMANDS.send, {
      channelId,
      data: { $bytes: arrayBufferToBase64(data) },
      reliable: options.reliable ?? false,
    });
  }

  /** Closes a channel; both sides get `channel-closed` with `reason: "closed"`. */
  async closeAsync(channelId: string): Promise<void> {
    await this.call(PEER_COMMANDS.close, { channelId });
  }

  /**
   * Listens for one of the peers events (`invite-status`, `channel-opened`, `joined`, `message`,
   * `channel-closed`); `message.data` arrives as bytes. Returns an unsubscribe function.
   */
  on<T extends PeerEventType>(type: T, handler: (event: PeerEventMap[T]) => void): () => void {
    const name = EVENT_NAMES[type];
    const wrapped: EventCallback = (event) => {
      const decoded = decodeEvent(type, (event as { data?: unknown }).data);
      if (decoded) handler(decoded);
    };
    this.client.on(name, wrapped);
    return () => this.client.off(name, wrapped);
  }
}
