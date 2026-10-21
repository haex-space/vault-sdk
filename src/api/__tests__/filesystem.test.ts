/**
 * @vitest-environment happy-dom
 *
 * File dialogs wait for the user: a slow choice must not run into the request
 * timeout, or the extension reports an error for a file the host still saves.
 */

import { afterEach, describe, expect, it } from "vitest";
import { connectedAsync, destroySdk, sdk } from "./iframeHost";

afterEach(destroySdk);

const waitAsync = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("client.filesystem dialogs", () => {
  it("wait for the user longer than the request timeout", async () => {
    const host = await connectedAsync({ timeout: 20 });
    const answers = [
      { start: () => sdk!.filesystem.saveFileAsync(new Uint8Array([1, 2]), { defaultPath: "a.pdf" }), result: { path: "/a.pdf", success: true } },
      { start: () => sdk!.filesystem.selectFolder({ title: "Folder" }), result: "/docs" },
      { start: () => sdk!.filesystem.selectFile({ multiple: true }), result: ["/a.png"] },
    ];
    for (const { start, result } of answers) {
      const nextRequest = host.nextRequest();
      const pending = start();
      const request = await nextRequest;
      await waitAsync(80);
      host.channel.port1.postMessage({ id: request.id, result });
      await expect(pending).resolves.toEqual(result);
    }
  });

  it("send the bytes of a saved file", async () => {
    const host = await connectedAsync();
    const nextRequest = host.nextRequest();
    const pending = sdk!.filesystem.saveFileAsync(new Uint8Array([1, 2]), { defaultPath: "a.pdf", title: "Save" });
    const request = await nextRequest;
    expect(request.params).toMatchObject({ data: [1, 2], defaultPath: "a.pdf", title: "Save" });
    host.channel.port1.postMessage({ id: request.id, result: null });
    await expect(pending).resolves.toBeNull();
  });
});
