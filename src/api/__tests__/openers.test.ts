/**
 * @vitest-environment happy-dom
 *
 * `client.openers` end to end: a real HaexVaultSdk in iframe mode, a real MessageChannel standing in
 * for the host, no mocks of either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { connectedAsync, destroySdk, sdk } from "./iframeHost";
import type { OpenRequest } from "../openers";

afterEach(destroySdk);

const REQUEST: OpenRequest = {
  action: "mail.compose",
  mail: { to: ["ben@example.org"], cc: [], bcc: [], subject: "Hallo", body: "Zeile 1\nZeile 2" },
};

describe("client.openers.take", () => {
  it("asks the host for the request and resolves its fields", async () => {
    const host = await connectedAsync();
    const nextRequest = host.nextRequest();
    const pending = sdk!.openers.take();
    const request = await nextRequest;
    expect(request.method).toBe("extension_opener_take");
    host.channel.port1.postMessage({ id: request.id, result: REQUEST });
    await expect(pending).resolves.toEqual(REQUEST);
  });

  it("resolves null when nothing waits", async () => {
    const host = await connectedAsync();
    const nextRequest = host.nextRequest();
    const pending = sdk!.openers.take();
    const request = await nextRequest;
    host.channel.port1.postMessage({ id: request.id, result: null });
    await expect(pending).resolves.toBeNull();
  });
});

describe("client.openers.onRequest", () => {
  it("takes the request when the host says one waits and hands it to the handler", async () => {
    const host = await connectedAsync();
    const received: OpenRequest[] = [];
    const heard = new Promise<void>((resolve) =>
      sdk!.openers.onRequest((request) => {
        received.push(request);
        resolve();
      }),
    );
    const nextRequest = host.nextRequest();
    host.channel.port1.postMessage({ type: "opener-request", data: {}, timestamp: 0 });
    const request = await nextRequest;
    expect(request.method).toBe("extension_opener_take");
    host.channel.port1.postMessage({ id: request.id, result: REQUEST });
    await heard;
    expect(received).toEqual([REQUEST]);
  });

  it("does not call the handler when the request is gone by the time it is taken", async () => {
    const host = await connectedAsync();
    let called = false;
    sdk!.openers.onRequest(() => {
      called = true;
    });
    const nextRequest = host.nextRequest();
    host.channel.port1.postMessage({ type: "opener-request", data: {}, timestamp: 0 });
    const request = await nextRequest;
    host.channel.port1.postMessage({ id: request.id, result: null });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(called).toBe(false);
  });

  it("stops after unsubscribing", async () => {
    const host = await connectedAsync();
    let asked = false;
    const off = sdk!.openers.onRequest(() => {});
    off();
    host.nextRequest().then(() => {
      asked = true;
    });
    host.channel.port1.postMessage({ type: "opener-request", data: {}, timestamp: 0 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(asked).toBe(false);
  });
});
