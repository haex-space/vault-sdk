/**
 * @vitest-environment happy-dom
 *
 * `client.dialog.confirm` end to end: a real HaexVaultSdk in iframe mode, a
 * real MessageChannel standing in for the host, no mocks of either.
 */

import { afterEach, describe, expect, it } from "vitest";
import { connectedAsync, destroySdk, sdk } from "./iframeHost";

afterEach(destroySdk);

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

  it("waits for the user longer than the request timeout", async () => {
    const host = await connectedAsync({ timeout: 20 });
    const nextRequest = host.nextRequest();
    const pending = sdk!.dialog.confirm({ message: "Delete?" });
    const request = await nextRequest;
    await new Promise((resolve) => setTimeout(resolve, 80));
    host.channel.port1.postMessage({ id: request.id, result: true });
    await expect(pending).resolves.toBe(true);
  });
});
