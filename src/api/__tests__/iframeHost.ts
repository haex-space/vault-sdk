/**
 * A real HaexVaultSdk in iframe mode, connected to a real MessageChannel that
 * stands in for the host. Tests answer each request themselves. Used by test
 * files with `@vitest-environment happy-dom`.
 */

import { HaexVaultSdk } from "../../client";
import { HAEXSPACE_MESSAGE_TYPES } from "../../messages";

export type Request = { id: string; method: string; params: Record<string, unknown> };

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

export let sdk: HaexVaultSdk | null = null;

/** Call from `afterEach`. */
export function destroySdk() {
  sdk?.destroy();
  sdk = null;
}

export async function connectedAsync(config: { timeout?: number } = {}) {
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
