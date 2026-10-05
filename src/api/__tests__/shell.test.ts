/**
 * @vitest-environment happy-dom
 *
 * `shell:output` backpressure end to end: a real HaexVaultSdk in iframe mode, a real
 * MessageChannel standing in for the host. The SDK acknowledges the output events it
 * handed to the extension's listeners.
 */

import { afterEach, describe, expect, it } from "vitest";
import { HaexVaultSdk } from "../../client";
import { SHELL_EVENTS } from "../../events";
import { HAEXSPACE_MESSAGE_TYPES } from "../../messages";
import type { EventCallback, HaexHubEvent } from "../../types";
import { ShellAPI } from "../shell";

type Request = { id: string; method: string; params: Record<string, unknown> };

/** Plays the host: answers the context request, records every other one and answers it. */
function startHost(answer: (request: Request) => unknown) {
  const channel = new MessageChannel();
  const requests: Request[] = [];
  channel.port1.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as Partial<Request> & { type?: string };
    if (data.type === HAEXSPACE_MESSAGE_TYPES.PORT_READY || !data.id) return;
    if (data.method === "extension_context_get") {
      channel.port1.postMessage({ id: data.id, result: { theme: "dark", locale: "de", platform: "linux" } });
      return;
    }
    requests.push(data as Request);
    channel.port1.postMessage({ id: data.id, ...(answer(data as Request) as object) });
  });
  channel.port1.start();
  const output = (sessionId: string, text: string) =>
    channel.port1.postMessage({ type: "shell:output", data: { sessionId, data: text }, timestamp: 0 });
  return { channel, requests, output };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

let sdk: HaexVaultSdk | null = null;

afterEach(() => {
  sdk?.destroy();
  sdk = null;
});

async function connect(host: ReturnType<typeof startHost>): Promise<HaexVaultSdk> {
  Object.defineProperty(window, "top", { configurable: true, get: () => ({}) as Window });
  const client = new HaexVaultSdk();
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: HAEXSPACE_MESSAGE_TYPES.PORT_INIT },
      ports: [host.channel.port2],
      source: window.parent,
    }),
  );
  await client.ready();
  return client;
}

describe("client.shell output acknowledgement", () => {
  it("acknowledges every output event after the listeners had it", async () => {
    const host = startHost(() => ({ result: null }));
    sdk = await connect(host);
    const heard: string[] = [];
    sdk.shell.onData((event: HaexHubEvent) => {
      heard.push((event.data as { data: string }).data);
      expect(host.requests).toHaveLength(0);
    });

    host.output("a", "one");
    host.output("a", "two");
    host.output("b", "three");
    await settle();

    expect(heard).toEqual(["one", "two", "three"]);
    const acks = host.requests.filter((r) => r.method === "extension_shell_ack");
    const total = (sessionId: string) =>
      acks.filter((r) => r.params.sessionId === sessionId).reduce((n, r) => n + (r.params.count as number), 0);
    expect(total("a")).toBe(2);
    expect(total("b")).toBe(1);
  });

  it("stops acknowledging when the host does not know the method", async () => {
    const host = startHost(() => ({ error: { code: 8000, message: "not supported" } }));
    sdk = await connect(host);
    host.output("a", "one");
    await settle();
    host.output("a", "two");
    await settle();
    expect(host.requests.filter((r) => r.method === "extension_shell_ack")).toHaveLength(1);
  });

  it.each([
    "Command extension_shell_ack not found",
    "extension_shell_ack not allowed. Command not found",
  ])("stops acknowledging when Tauri rejects the command: %s", async (rejection) => {
    // Native window mode: the request is a Tauri invoke, which rejects with a plain string.
    const listeners: EventCallback[] = [];
    const acks: unknown[] = [];
    const fakeSdk = {
      on: (_type: string, callback: EventCallback) => listeners.push(callback),
      request: (method: string, params: unknown) => {
        acks.push({ method, params });
        return Promise.reject(rejection);
      },
    } as unknown as HaexVaultSdk;
    new ShellAPI(fakeSdk);
    const output = (data: string) =>
      listeners.forEach((listener) =>
        listener({ type: SHELL_EVENTS.OUTPUT, data: { sessionId: "a", data }, timestamp: 0 }),
      );

    output("one");
    await settle();
    output("two");
    await settle();
    expect(acks).toHaveLength(1);
  });
});
