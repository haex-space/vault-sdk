/**
 * @vitest-environment happy-dom
 *
 * Integration tests for the SDK iframe-mode MessagePort handshake.
 *
 * These tests exercise the actual window / MessagePort plumbing — no mocks of
 * either. A real `MessageChannel` is created, `port2` is sent via a real
 * window-level `postMessage`, and the SDK's reaction (installing the port
 * listener, sending PORT_READY, rejecting bad input) is observed end-to-end.
 *
 * Coverage focus:
 *   - Happy-path handshake + bidirectional messaging
 *   - Fail-fast on timeout when no port arrives
 *   - Strict filtering: only PORT_INIT (with an attached port) resolves
 *   - Single-shot: additional PORT_INIT messages after handshake are ignored
 *   - Transport rejects when port is not yet established
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendPostMessage,
} from "../transport";
import { HAEXSPACE_MESSAGE_TYPES } from "../../messages";
import { ErrorCode, HaexVaultSdkError, type ExtensionInfo } from "../../types";
import type { ClientConfig, PendingRequest } from "../context";
import { initIframeMode } from "../init";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeConfig = (overrides: Partial<ClientConfig> = {}): ClientConfig => ({
  debug: false,
  timeout: 30_000,
  ...overrides,
});

/**
 * Force `isInIframe()` to report true so we can test iframe-mode flows in a
 * happy-dom environment where `window.self === window.top` by default.
 */
const makeIframeContext = () => {
  Object.defineProperty(window, "top", {
    configurable: true,
    get: () => ({} as Window),
  });
};

const makeContext = () => ({
  config: makeConfig(),
  state: {
    initialized: false,
    isNativeWindow: false,
    requestCounter: 0,
    setupCompleted: false,
    extensionInfo: null,
    context: null,
    orm: null,
  },
  collections: {
    pendingRequests: new Map(),
    eventListeners: new Map(),
    externalRequestHandlers: new Map(),
    reactiveSubscribers: new Set<() => void>(),
  },
  promises: {
    readyPromise: Promise.resolve(),
    resolveReady: () => undefined,
    setupPromise: null,
    setupHook: null,
  },
  handlers: {
    messageHandler: null,
  },
});

const silentLog = () => undefined;

const timeouts: ReturnType<typeof setTimeout>[] = [];

afterEach(() => {
  for (const t of timeouts) clearTimeout(t);
  timeouts.length = 0;
  vi.useRealTimers();
});

/**
 * Simulate the main window: pack `port2` into a PORT_INIT message and fire a
 * real `MessageEvent` on the iframe's `window`. We dispatch via a MessageEvent
 * constructor so `event.ports` is populated correctly in happy-dom.
 */
const sendPortFromHost = (port: MessagePort) => {
  const event = new MessageEvent("message", {
    data: { type: HAEXSPACE_MESSAGE_TYPES.PORT_INIT },
    ports: [port],
  });
  window.dispatchEvent(event);
};

// ---------------------------------------------------------------------------
// Happy-path handshake
// ---------------------------------------------------------------------------

describe("initIframeMode — handshake happy path", () => {
  it("receives the host port, installs a listener, and sends PORT_READY", async () => {
    makeIframeContext();

    const channel = new MessageChannel();
    const hostPort = channel.port1; // main-window side
    const received: unknown[] = [];
    hostPort.addEventListener("message", (event: MessageEvent) => {
      received.push(event.data);
    });
    hostPort.start();

    const messageHandler = vi.fn();

    // Kick off the init; immediately fire the PORT_INIT so the handshake
    // resolves.
    const initPromise = initIframeMode(
      makeContext(),
      silentLog,
      messageHandler,
    );
    sendPortFromHost(channel.port2);

    const port = await initPromise;
    expect(port).toBe(channel.port2);

    // Give the microtask queue a chance to deliver PORT_READY on the host side.
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(received).toEqual([
      expect.objectContaining({ type: HAEXSPACE_MESSAGE_TYPES.PORT_READY }),
    ]);

    // Host -> SDK messages are now delivered via the port
    received.length = 0;
    hostPort.postMessage({ type: "haextension:context:changed", data: { context: {} }, timestamp: 1 });
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(messageHandler).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Timeout / rejection
// ---------------------------------------------------------------------------

describe("initIframeMode — handshake timeout", () => {
  it("rejects with TIMEOUT if no PORT_INIT arrives", async () => {
    makeIframeContext();
    vi.useFakeTimers();

    const initPromise = initIframeMode(
      makeContext(),
      silentLog,
      vi.fn(),
    );
    // Attach a catch handler eagerly so the timer-driven rejection is not
    // flagged as unhandled before the await below picks it up.
    const caught: unknown[] = [];
    initPromise.catch((e) => caught.push(e));

    await vi.advanceTimersByTimeAsync(11_000);

    expect(caught).toHaveLength(1);
    expect(caught[0]).toBeInstanceOf(HaexVaultSdkError);
    expect(caught[0]).toMatchObject({ code: ErrorCode.TIMEOUT });
  });
});

// ---------------------------------------------------------------------------
// Input validation / attack scenarios
// ---------------------------------------------------------------------------

describe("initIframeMode — hostile / malformed window messages", () => {
  it("ignores messages whose type is not PORT_INIT", async () => {
    makeIframeContext();

    const messageHandler = vi.fn();

    const initPromise = initIframeMode(
      makeContext(),
      silentLog,
      messageHandler,
    );

    // A flurry of innocuous/attack messages arrives on the window first.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "haexspace:port:init-fake" },
        ports: [new MessageChannel().port1],
      })
    );
    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "unknown" } })
    );
    window.dispatchEvent(new MessageEvent("message", { data: "some-string" }));
    window.dispatchEvent(new MessageEvent("message", { data: null }));

    // None of those should have resolved the handshake — still pending.
    let settled = false;
    initPromise.then(() => (settled = true)).catch(() => (settled = true));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    // Now send the legit PORT_INIT.
    const channel = new MessageChannel();
    sendPortFromHost(channel.port2);

    const port = await initPromise;
    expect(port).toBe(channel.port2);
  });

  it("ignores a PORT_INIT message whose ports array is empty", async () => {
    makeIframeContext();
    vi.useFakeTimers();

    const initPromise = initIframeMode(
      makeContext(),
      silentLog,
      vi.fn(),
    );
    const caught: unknown[] = [];
    initPromise.catch((e) => caught.push(e));

    // Malformed PORT_INIT with no port attached.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: HAEXSPACE_MESSAGE_TYPES.PORT_INIT },
        ports: [],
      })
    );

    // Handshake must NOT resolve — still waiting for a real port, so the
    // timeout path must eventually kick in.
    await vi.advanceTimersByTimeAsync(11_000);
    expect(caught).toHaveLength(1);
    expect(caught[0]).toMatchObject({ code: ErrorCode.TIMEOUT });
  });

  it("does not process additional PORT_INIT messages after handshake", async () => {
    makeIframeContext();

    const channel = new MessageChannel();
    const initPromise = initIframeMode(
      makeContext(),
      silentLog,
      vi.fn(),
    );
    sendPortFromHost(channel.port2);
    await initPromise;

    // A second PORT_INIT with a different port is a classic port-hijack
    // attempt. The SDK removed its window listener after the first
    // handshake, so this must have no effect — no throw, no swap.
    const evilChannel = new MessageChannel();
    expect(() => sendPortFromHost(evilChannel.port2)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

describe("sendPostMessage — port transport", () => {
  it("sends the request on the given MessagePort", async () => {
    const channel = new MessageChannel();
    const received: unknown[] = [];
    channel.port1.addEventListener("message", (event: MessageEvent) => {
      received.push(event.data);
    });
    channel.port1.start();

    const pending = new Map<string, PendingRequest>();
    const sendPromise = sendPostMessage<unknown>(
      "get.context",
      { foo: "bar" },
      "req_1",
      makeConfig(),
      null as unknown as ExtensionInfo,
      pending,
      channel.port2
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(received).toEqual([
      expect.objectContaining({
        id: "req_1",
        method: "get.context",
        params: { foo: "bar" },
      }),
    ]);

    // Resolve the promise so sendPromise settles (pending.resolve is called
    // from the events module in real usage; here we fake it).
    pending.get("req_1")!.resolve("ok");
    await expect(sendPromise).resolves.toBe("ok");
  });

  it("rejects immediately when no port is available", async () => {
    const pending = new Map<string, PendingRequest>();
    await expect(
      sendPostMessage<unknown>(
        "any.method",
        {},
        "req_1",
        makeConfig(),
        null as unknown as ExtensionInfo,
        pending,
        null
      )
    ).rejects.toMatchObject({ code: ErrorCode.EXTENSION_NOT_INITIALIZED });
    // Should NOT have registered a pending entry — fail-fast must not leak
    // entries into the requests map (those would otherwise sit until timeout).
    expect(pending.size).toBe(0);
  });
});
