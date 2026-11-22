/**
 * @vitest-environment happy-dom
 *
 * `client.header` end to end: a real HaexVaultSdk in iframe mode, a real MessageChannel standing in
 * for the host, no mocks of either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { HAEXTENSION_EVENTS } from "../../events";
import type { HeaderDescription } from "../../types/header";
import { connectedAsync, destroySdk, sdk } from "./iframeHost";

afterEach(destroySdk);

const DESCRIPTION: HeaderDescription = {
  start: [{ type: "toggle", id: "sidebar", label: "Sidebar", icon: "icons/sidebar.svg", pressed: true }],
  end: [{ type: "search", id: "q", label: "Search", value: "" }],
};

const MENU: HeaderDescription = {
  end: [
    {
      type: "menu",
      id: "filter",
      label: "Filter",
      icon: "icons/filter.svg",
      items: [{ type: "item", id: "all", label: "All" }],
    },
  ],
};

/** Sends `description` and lets the host answer with `reply`; resolves what `set` resolves. */
async function setWith(reply: { result: unknown } | { error: unknown }) {
  const host = await connectedAsync();
  const nextRequest = host.nextRequest();
  const pending = sdk!.header.set(DESCRIPTION);
  const request = await nextRequest;
  expect(request).toMatchObject({ method: "extension_header_set", params: DESCRIPTION });
  host.channel.port1.postMessage({ id: request.id, ...reply });
  return pending;
}

describe("client.header.set", () => {
  it("sends a menu control with its entries", async () => {
    const host = await connectedAsync();
    const nextRequest = host.nextRequest();
    const pending = sdk!.header.set(MENU);
    const request = await nextRequest;
    expect(request).toMatchObject({ method: "extension_header_set", params: MENU });
    host.channel.port1.postMessage({ id: request.id, result: null });
    await expect(pending).resolves.toBe(true);
  });

  it("sends the description and resolves true when the host applied it", async () => {
    await expect(setWith({ result: null })).resolves.toBe(true);
  });

  it("resolves false when haex-vault answers not supported (8000)", async () => {
    await expect(setWith({ error: { code: 8000, message: "not supported" } })).resolves.toBe(false);
  });

  it.each([
    ["a plain string", "Unknown method: extension_header_set"],
    ["an error object", { message: "Unknown method: extension_header_set" }],
  ])("resolves false when haex-vault 2.x answers Unknown method as %s", async (_form, error) => {
    await expect(setWith({ error })).resolves.toBe(false);
  });

  it("rejects a refused description (3001) with the host's error", async () => {
    await expect(setWith({ error: { code: 3001, message: 'header: control "x0": too many controls' } })).rejects.toMatchObject({
      code: 3001,
    });
  });

  it("rejects every other error", async () => {
    await expect(setWith({ error: { code: 8002, message: "extension disabled" } })).rejects.toMatchObject({ code: 8002 });
  });

  it("rejects an error text that only mentions an unknown method", async () => {
    await expect(setWith({ error: "Something failed: Unknown method" })).rejects.toBe("Something failed: Unknown method");
  });
});

describe("client.header.onEvent", () => {
  it("hands the event of a used control to the handler until it is unsubscribed", async () => {
    const host = await connectedAsync();
    const seen: unknown[] = [];
    let resolveFirstEvent!: (event: unknown) => void;
    const firstEvent = new Promise<unknown>((resolve) => {
      resolveFirstEvent = resolve;
    });
    const unsubscribe = sdk!.header.onEvent((event) => {
      seen.push(event);
      resolveFirstEvent(event);
    });

    host.channel.port1.postMessage({
      type: HAEXTENSION_EVENTS.HEADER_EVENT,
      data: { id: "sidebar", kind: "toggle", value: false },
      timestamp: 1,
    });
    await expect(firstEvent).resolves.toEqual({ id: "sidebar", kind: "toggle", value: false });
    expect(seen).toEqual([{ id: "sidebar", kind: "toggle", value: false }]);

    unsubscribe();
    let resolveBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    });
    const onBarrier = () => resolveBarrier();
    sdk!.on("test:barrier", onBarrier);
    host.channel.port1.postMessage({
      type: HAEXTENSION_EVENTS.HEADER_EVENT,
      data: { id: "sidebar", kind: "toggle", value: true },
      timestamp: 2,
    });
    host.channel.port1.postMessage({ type: "test:barrier", timestamp: 3 });
    await barrier;
    sdk!.off("test:barrier", onBarrier);
    expect(seen).toHaveLength(1);
  });
});
