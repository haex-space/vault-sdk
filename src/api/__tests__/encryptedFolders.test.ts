/**
 * @vitest-environment happy-dom
 *
 * `client.encryptedFolders` end to end: a real HaexVaultSdk in iframe mode, a
 * real MessageChannel standing in for the host, no mocks of either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { HaexVaultSdk } from "../../client";
import { HAEXSPACE_MESSAGE_TYPES } from "../../messages";
import { HAEXTENSION_EVENTS } from "../../events";
import { HostErrorCode, PermissionErrorCode } from "../../types";

type Request = { id: string; method: string; params: Record<string, unknown> };

function startHost() {
  const channel = new MessageChannel();
  const waiters: Array<(request: Request) => void> = [];
  channel.port1.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as Partial<Request> & { type?: string };
    if (data.type === HAEXSPACE_MESSAGE_TYPES.PORT_READY || !data.id) return;
    if (data.method === "extension_context_get") {
      channel.port1.postMessage({ id: data.id, result: { theme: "dark", locale: "de", platform: "linux" } });
      return;
    }
    waiters.shift()?.(data as Request);
  });
  channel.port1.start();
  const nextRequest = () =>
    new Promise<Request>((resolve) => {
      waiters.push(resolve);
    });
  return { channel, nextRequest };
}

let sdk: HaexVaultSdk | null = null;

afterEach(() => {
  sdk?.destroy();
  sdk = null;
});

async function connectedAsync(config: { timeout?: number } = {}) {
  Object.defineProperty(window, "top", { configurable: true, get: () => ({}) as Window });
  const host = startHost();
  sdk = new HaexVaultSdk(config);
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: HAEXSPACE_MESSAGE_TYPES.PORT_INIT },
      ports: [host.channel.port2],
      source: window.parent,
    }),
  );
  await sdk.ready();
  return host;
}

/** Answers the next request with `result` and returns the request. */
async function answerAsync(host: ReturnType<typeof startHost>, result: unknown): Promise<Request> {
  const request = await host.nextRequest();
  host.channel.port1.postMessage({ id: request.id, result });
  return request;
}

describe("client.encryptedFolders", () => {
  it("chooses a folder and waits for the user's answer without a deadline", async () => {
    const host = await connectedAsync({ timeout: 20 });
    const nextRequest = host.nextRequest();
    const pending = sdk!.encryptedFolders.choose("storage-1", "readWrite");
    const request = await nextRequest;
    expect(request).toMatchObject({
      method: "extension_encrypted_folder_choose",
      params: { request: { storageId: "storage-1", access: "readWrite" } },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    host.channel.port1.postMessage({ id: request.id, result: { folderId: "F1", name: "Steuer" } });
    await expect(pending).resolves.toEqual({ folderId: "F1", name: "Steuer" });
  });

  it("resolves null when the user closes the chooser", async () => {
    const host = await connectedAsync();
    const pending = sdk!.encryptedFolders.choose("storage-1", "read");
    await answerAsync(host, null);
    await expect(pending).resolves.toBeNull();
  });

  it("lists the root by default and returns the entries", async () => {
    const host = await connectedAsync();
    const entries = [
      { name: "notes", kind: "folder" },
      { name: "a.txt", kind: "file", size: 5, modified: 1_760_000_000_000 },
    ];
    const pending = sdk!.encryptedFolders.list("storage-1", "F1");
    const request = await answerAsync(host, { entries });
    expect(request).toMatchObject({
      method: "extension_encrypted_folder_list",
      params: { request: { storageId: "storage-1", folderId: "F1", path: "" } },
    });
    await expect(pending).resolves.toEqual(entries);
  });

  it("uploads as base64 and downloads the same bytes back", async () => {
    const host = await connectedAsync();
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 72, 105]);

    const uploading = sdk!.encryptedFolders.upload("storage-1", "F1", "notes/a.bin", bytes);
    const upload = await answerAsync(host, null);
    expect(upload).toMatchObject({
      method: "extension_encrypted_folder_upload",
      params: { request: { storageId: "storage-1", folderId: "F1", path: "notes/a.bin" } },
    });
    await expect(uploading).resolves.toBeUndefined();
    const sent = (upload.params.request as { data: string }).data;
    expect(sent).toBe("AAEC+v9IaQ==");

    const downloading = sdk!.encryptedFolders.download("storage-1", "F1", "notes/a.bin");
    const download = await answerAsync(host, sent);
    expect(download).toMatchObject({
      method: "extension_encrypted_folder_download",
      params: { request: { storageId: "storage-1", folderId: "F1", path: "notes/a.bin" } },
    });
    const received = await downloading;
    expect(received).toBeInstanceOf(Uint8Array);
    expect(Array.from(received)).toEqual(Array.from(bytes));
  });

  it("deletes a path", async () => {
    const host = await connectedAsync();
    const pending = sdk!.encryptedFolders.delete("storage-1", "F1", "notes");
    const request = await answerAsync(host, null);
    expect(request).toMatchObject({
      method: "extension_encrypted_folder_delete",
      params: { request: { storageId: "storage-1", folderId: "F1", path: "notes" } },
    });
    await expect(pending).resolves.toBeUndefined();
  });

  it("retries after the user grants the encryptedFolder permission", async () => {
    const host = await connectedAsync();
    const pending = sdk!.encryptedFolders.list("storage-1", "F1", "notes");
    const first = await host.nextRequest();
    host.channel.port1.postMessage({
      id: first.id,
      error: {
        code: PermissionErrorCode.PROMPT_REQUIRED,
        message: "permission prompt required",
        extensionId: "ext-1",
        extensionName: "Probe",
        resourceType: "encryptedFolder",
        action: "read",
        target: "storage-1/F1",
      },
    });
    const retry = host.nextRequest();
    await new Promise((resolve) => setTimeout(resolve, 20));
    host.channel.port1.postMessage({
      type: HAEXTENSION_EVENTS.PERMISSION_RESOLVED,
      data: { resourceType: "encryptedFolder", action: "read", target: "storage-1/F1", decision: "granted" },
      timestamp: Date.now(),
    });
    const second = await retry;
    expect(second).toMatchObject({ method: "extension_encrypted_folder_list", params: first.params });
    host.channel.port1.postMessage({ id: second.id, result: { entries: [] } });
    await expect(pending).resolves.toEqual([]);
  });

  it("passes a damaged entry on as code 3010", async () => {
    const host = await connectedAsync();
    const pending = sdk!.encryptedFolders.download("storage-1", "F1", "a.txt");
    const request = await host.nextRequest();
    host.channel.port1.postMessage({ id: request.id, error: { code: 3010, message: "damaged" } });
    await expect(pending).rejects.toMatchObject({ code: HostErrorCode.ENCRYPTED_DATA_DAMAGED });
  });
});
