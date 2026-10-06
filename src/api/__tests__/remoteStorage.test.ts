/**
 * @vitest-environment happy-dom
 *
 * `client.remoteStorage.backends` end to end: a real HaexVaultSdk in iframe mode, a
 * real MessageChannel standing in for the host, no mocks of either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { HaexVaultSdk } from "../../client";
import { HAEXSPACE_MESSAGE_TYPES } from "../../messages";

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

describe("client.remoteStorage.backends", () => {
  it("proposes a bucket on the same provider without credentials and waits for the user", async () => {
    const host = await connectedAsync({ timeout: 20 });
    const nextRequest = host.nextRequest();
    const pending = sdk!.remoteStorage.backends.add({
      name: "Fotos",
      type: "s3",
      config: { bucket: "photos" },
      sameProviderAs: "storage-1",
    });
    const request = await nextRequest;
    expect(request).toMatchObject({
      method: "extension_remote_storage_add_backend",
      params: {
        request: { name: "Fotos", type: "s3", config: { bucket: "photos" }, sameProviderAs: "storage-1" },
      },
    });
    expect(JSON.stringify(request.params)).not.toMatch(/accessKeyId|secretAccessKey|sessionToken/);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const created = { id: "storage-2", type: "s3", name: "Fotos", providerName: "RustFS", bucket: "photos" };
    host.channel.port1.postMessage({ id: request.id, result: created });
    await expect(pending).resolves.toEqual(created);
  });

  it.each([
    ["update", (s: HaexVaultSdk) => s.remoteStorage.backends.update({ backendId: "storage-1", name: "Neu" })],
    ["remove", (s: HaexVaultSdk) => s.remoteStorage.backends.remove("storage-1")],
    ["test", (s: HaexVaultSdk) => s.remoteStorage.backends.test("storage-1")],
  ])("%s waits for the user's answer in the host", async (_name, run) => {
    const host = await connectedAsync({ timeout: 20 });
    const nextRequest = host.nextRequest();
    const pending = run(sdk!);
    const request = await nextRequest;
    await new Promise((resolve) => setTimeout(resolve, 80));
    host.channel.port1.postMessage({ id: request.id, result: null });
    await expect(pending).resolves.not.toThrow();
  });
});
