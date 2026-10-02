/**
 * @vitest-environment happy-dom
 *
 * `client.tab.requestAttention` end to end: a real HaexVaultSdk in iframe mode,
 * a real MessageChannel standing in for the host, no mocks of either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { HaexVaultSdk } from "../../client";
import { HAEXSPACE_MESSAGE_TYPES } from "../../messages";

type Request = { id: string; method: string; params: Record<string, unknown> };

/** Plays the host: answers the context request and records every other request. */
function startHost() {
  const channel = new MessageChannel();
  const requests: Request[] = [];
  const waiters: Array<(request: Request) => void> = [];
  channel.port1.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as Partial<Request> & { type?: string };
    if (data.type === HAEXSPACE_MESSAGE_TYPES.PORT_READY || !data.id) return;
    if (data.method === "extension_context_get") {
      channel.port1.postMessage({ id: data.id, result: { theme: "dark", locale: "de", platform: "linux" } });
      return;
    }
    requests.push(data as Request);
    waiters.shift()?.(data as Request);
  });
  channel.port1.start();
  const nextRequest = () =>
    new Promise<Request>((resolve) => {
      waiters.push(resolve);
    });
  return { channel, requests, nextRequest };
}

let sdk: HaexVaultSdk | null = null;

afterEach(() => {
  sdk?.destroy();
  sdk = null;
});

describe("client.tab.requestAttention", () => {
  it.each([true, false])("sends extension_tab_attention { active: %s } over the host port", async (active) => {
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

    const nextRequest = host.nextRequest();
    const pending = sdk.tab.requestAttention(active);
    const request = await nextRequest;
    expect(request).toMatchObject({ method: "extension_tab_attention", params: { active } });

    host.channel.port1.postMessage({ id: request.id, result: null });
    await expect(pending).resolves.toBeUndefined();
  });
});
