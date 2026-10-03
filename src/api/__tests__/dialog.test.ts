/**
 * @vitest-environment happy-dom
 *
 * `client.dialog.confirm` end to end: a real HaexVaultSdk in iframe mode, a
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

async function connectedAsync() {
  Object.defineProperty(window, "top", { configurable: true, get: () => ({}) as Window });
  const host = startHost();
  sdk = new HaexVaultSdk();
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

describe("client.dialog.confirm", () => {
  it.each([true, false])("asks the host and resolves its answer %s", async (answer) => {
    const host = await connectedAsync();
    const nextRequest = host.nextRequest();
    const pending = sdk!.dialog.confirm({ message: "Delete?", destructive: true });
    const request = await nextRequest;
    expect(request).toMatchObject({
      method: "extension_dialog_confirm",
      params: { message: "Delete?", destructive: true },
    });
    host.channel.port1.postMessage({ id: request.id, result: answer });
    await expect(pending).resolves.toBe(answer);
  });

  it("treats anything but true as cancel", async () => {
    const host = await connectedAsync();
    const nextRequest = host.nextRequest();
    const pending = sdk!.dialog.confirm({ message: "?" });
    const request = await nextRequest;
    host.channel.port1.postMessage({ id: request.id, result: null });
    await expect(pending).resolves.toBe(false);
  });
});
