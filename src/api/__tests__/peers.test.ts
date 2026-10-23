/**
 * The peers API sends the bridge methods of holzi spec 057 (`contracts/bridge.md`) with the
 * parameters the host reads, rejects host errors with a `details.reason` as `PeerError`, and hands
 * the extension its events with message data as bytes.
 */

import { describe, expect, it } from "vitest";
import type { HaexVaultSdk } from "../../client";
import { PEERS_EVENTS } from "../../events";
import type { EventCallback } from "../../types";
import { PeerError, PeersAPI } from "../peers";

type Request = { method: string; params: unknown };

function fake(answer: (request: Request) => unknown = () => ({})) {
  const requests: Request[] = [];
  const listeners = new Map<string, Set<EventCallback>>();
  const emit = (type: string, data: unknown) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener({ type, data, timestamp: 0 });
  };
  const sdk = {
    request: (method: string, params: unknown) => {
      const request = { method, params };
      requests.push(request);
      try {
        return Promise.resolve(answer(request));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    on: (type: string, callback: EventCallback) => {
      const set = listeners.get(type) ?? new Set();
      set.add(callback);
      listeners.set(type, set);
    },
    off: (type: string, callback: EventCallback) => listeners.get(type)?.delete(callback),
  } as unknown as HaexVaultSdk;
  return { api: new PeersAPI(sdk), requests, emit };
}

function hostError(code: number, details?: Record<string, unknown>) {
  return () => {
    throw { code, message: "refused", details };
  };
}

describe("PeersAPI requests", () => {
  it("invites a contact with its payload and returns the invitation's id", async () => {
    const { api, requests } = fake(() => ({ inviteId: "i1" }));
    await expect(api.inviteAsync("c1", { game: "doom", version: 1 })).resolves.toEqual({ inviteId: "i1" });
    expect(requests).toEqual([
      { method: "extension_peers_invite", params: { contactId: "c1", payload: { game: "doom", version: 1 } } },
    ]);
  });

  it("withdraws an invitation by its id", async () => {
    const { api, requests } = fake();
    await expect(api.cancelInviteAsync("i1")).resolves.toBeUndefined();
    expect(requests).toEqual([{ method: "extension_peers_invite_cancel", params: { inviteId: "i1" } }]);
  });

  it("opens a lobby and returns the join code unchanged", async () => {
    const { api, requests } = fake(() => ({ joinCode: "haex-vault:join:abc" }));
    await expect(api.openLobbyAsync("doom-1", "public")).resolves.toEqual({ joinCode: "haex-vault:join:abc" });
    expect(requests).toEqual([
      { method: "extension_peers_lobby_open", params: { lobbyId: "doom-1", visibility: "public" } },
    ]);
  });

  it("closes a lobby by its id", async () => {
    const { api, requests } = fake();
    await api.closeLobbyAsync("doom-1");
    expect(requests).toEqual([{ method: "extension_peers_lobby_close", params: { lobbyId: "doom-1" } }]);
  });

  it("joins with code, display name and payload and returns the channel and lobby", async () => {
    const { api, requests } = fake(() => ({ channelId: "ch1", lobbyId: "doom-1" }));
    await expect(api.joinAsync("haex-vault:join:abc", "Anna", { v: 1 })).resolves.toEqual({
      channelId: "ch1",
      lobbyId: "doom-1",
    });
    expect(requests).toEqual([
      {
        method: "extension_peers_join",
        params: { joinCode: "haex-vault:join:abc", displayName: "Anna", payload: { v: 1 } },
      },
    ]);
  });

  it("removes and closes a channel by its id", async () => {
    const { api, requests } = fake();
    await api.removeAsync("ch1");
    await api.closeAsync("ch2");
    expect(requests).toEqual([
      { method: "extension_peers_remove", params: { channelId: "ch1" } },
      { method: "extension_peers_close", params: { channelId: "ch2" } },
    ]);
  });

  it("sends bytes as $bytes Base64, fast unless reliable is asked for", async () => {
    const { api, requests } = fake();
    await api.sendAsync("ch1", new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
    await api.sendAsync("ch1", new Uint8Array([]), { reliable: true });
    expect(requests).toEqual([
      { method: "extension_peers_send", params: { channelId: "ch1", data: { $bytes: "/9j/AA==" }, reliable: false } },
      { method: "extension_peers_send", params: { channelId: "ch1", data: { $bytes: "" }, reliable: true } },
    ]);
  });

  it("names the host's size limits", () => {
    const { api } = fake();
    expect([api.MAX_FAST_BYTES, api.MAX_RELIABLE_BYTES, api.MAX_PAYLOAD_BYTES]).toEqual([1024, 65536, 4096]);
  });
});

describe("PeersAPI errors", () => {
  it.each([
    [1001, "contact_unknown", "PEER_CONTACT_UNKNOWN"],
    [1001, "invite_not_open", "PEER_INVITE_UNKNOWN"],
    [1001, "channel_unknown", "PEER_CHANNEL_CLOSED"],
    [8001, "channel_closed", "PEER_CHANNEL_CLOSED"],
    [1001, "lobby_closed", "PEER_LOBBY_CLOSED"],
    [1002, "not_admitted", "PEER_NOT_ALLOWED"],
    [7000, "too_large", "PEER_PAYLOAD_TOO_LARGE"],
    [7000, "limit", "PEER_LIMIT"],
    [8001, "network_unavailable", "PEER_NETWORK_UNAVAILABLE"],
    [3001, "invalid_input", "PEER_INVALID_INPUT"],
  ])("rejects %i %s as a PeerError named %s", async (code, reason, kind) => {
    const { api } = fake(hostError(code, { reason }));
    const error = await api.closeAsync("ch1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PeerError);
    expect(error).toMatchObject({ code, reason, kind, message: "refused" });
    expect((error as PeerError).cause).toEqual({ code, message: "refused", details: { reason } });
  });

  it("carries the limit of a too large message and of a full reliable queue", async () => {
    const tooLarge = fake(hostError(7000, { reason: "too_large", limit: 1024 }));
    await expect(tooLarge.api.sendAsync("ch1", new Uint8Array(1025))).rejects.toMatchObject({
      reason: "too_large",
      limit: 1024,
    });
    const full = fake(hostError(7000, { reason: "limit", limit: 16 }));
    await expect(full.api.sendAsync("ch1", new Uint8Array(1), { reliable: true })).rejects.toMatchObject({
      reason: "limit",
      limit: 16,
      details: { reason: "limit", limit: 16 },
    });
  });

  it("rejects a refused permission and an unknown reason unchanged", async () => {
    const denied = { code: 1002, message: "denied", details: { resourceType: "peers" } };
    await expect(fake(() => { throw denied; }).api.inviteAsync("c1", {})).rejects.toBe(denied);
    const unknown = { code: 1001, message: "gone", details: { reason: "something_new" } };
    await expect(fake(() => { throw unknown; }).api.closeAsync("ch1")).rejects.toBe(unknown);
    const plain = new Error("timeout");
    await expect(fake(() => { throw plain; }).api.closeAsync("ch1")).rejects.toBe(plain);
  });
});

describe("PeersAPI events", () => {
  it("decodes the Base64 data of a message into bytes", () => {
    const { api, emit } = fake();
    const got: unknown[] = [];
    api.on("message", (message) => got.push(message));
    emit(PEERS_EVENTS.MESSAGE, { channelId: "ch1", data: "/9j/AA==", reliable: true });
    expect(got).toEqual([{ channelId: "ch1", data: new Uint8Array([0xff, 0xd8, 0xff, 0x00]), reliable: true }]);
  });

  it("drops a message without channel or data", () => {
    const { api, emit } = fake();
    const got: unknown[] = [];
    api.on("message", (message) => got.push(message));
    emit(PEERS_EVENTS.MESSAGE, { channelId: "ch1", data: 42, reliable: false });
    emit(PEERS_EVENTS.MESSAGE, null);
    emit(PEERS_EVENTS.MESSAGE, { channelId: "ch1", data: "!", reliable: false });
    expect(got).toEqual([]);
  });

  it("hands on the other events by their name without prefix", () => {
    const { api, emit } = fake();
    const got: [string, unknown][] = [];
    api.on("invite-status", (e) => got.push(["invite-status", e]));
    api.on("channel-opened", (e) => got.push(["channel-opened", e]));
    api.on("joined", (e) => got.push(["joined", e]));
    api.on("channel-closed", (e) => got.push(["channel-closed", e]));
    const status = { inviteId: "i1", status: "unreachable", hint: "share_current_card" };
    const opened = { channelId: "ch1", origin: "invitation", inviteId: "i1", from: { name: "Ben" }, payload: {} };
    const joined = { lobbyId: "l", channelId: "ch2", displayName: "Anna", verified: false, payload: null };
    const closed = { channelId: "ch1", reason: "timeout" };
    emit(PEERS_EVENTS.INVITE_STATUS, status);
    emit(PEERS_EVENTS.CHANNEL_OPENED, opened);
    emit(PEERS_EVENTS.JOINED, joined);
    emit(PEERS_EVENTS.CHANNEL_CLOSED, closed);
    expect(got).toEqual([
      ["invite-status", status],
      ["channel-opened", opened],
      ["joined", joined],
      ["channel-closed", closed],
    ]);
  });

  it("stops handing on events after unsubscribing", () => {
    const { api, emit } = fake();
    const got: unknown[] = [];
    const unsubscribe = api.on("channel-closed", (e) => got.push(e));
    unsubscribe();
    emit(PEERS_EVENTS.CHANNEL_CLOSED, { channelId: "ch1", reason: "closed" });
    expect(got).toEqual([]);
  });
});
