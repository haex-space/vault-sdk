import type { HaexVaultSdk } from "../client";
import type { EventCallback, HaexHubEvent } from "../types";
import { SHELL_COMMANDS } from "../commands/shell";
import { SHELL_EVENTS } from "../events";

/** The host's answer to a method it does not offer. */
const NOT_SUPPORTED = 8000;

/**
 * Whether the host does not offer the method: a MessagePort host answers 8000, Tauri rejects
 * an invoke of a command it does not register with `Command <name> not found` (or, behind
 * its access control, `<name> not allowed. Command not found`).
 */
function isUnsupported(error: unknown): boolean {
  if ((error as { code?: number } | null)?.code === NOT_SUPPORTED) return true;
  return typeof error === "string" && /\bcommand (\S+ )?not found\b/i.test(error);
}

export interface ShellCreateOptions {
  /** Shell executable (e.g., "/bin/bash"). If omitted, uses $SHELL or /bin/sh. */
  shell?: string;
  /** Working directory. If omitted, uses home directory. */
  cwd?: string;
  /** Initial terminal columns (default: 80) */
  cols?: number;
  /** Initial terminal rows (default: 24) */
  rows?: number;
  /** Environment variables to set */
  env?: Record<string, string>;
}

export interface ShellCreateResponse {
  sessionId: string;
  shellName: string;
}

export interface ShellOutputEvent {
  sessionId: string;
  data: string;
}

export interface ShellExitEvent {
  sessionId: string;
  exitCode: number | null;
}

export interface ShellInfo {
  name: string;
  path: string;
}

export class ShellAPI {
  /** `shell:output` events per session handed on but not yet acknowledged. */
  private readonly unacknowledged = new Map<string, number>();
  private flushScheduled = false;
  /** The host does not know `extension_shell_ack` (it reads output without backpressure). */
  private ackUnsupported = false;

  constructor(private readonly sdk: HaexVaultSdk) {
    // Registered first, so the acknowledgement is scheduled before the extension's own
    // listeners run and sent after they returned.
    this.sdk.on(SHELL_EVENTS.OUTPUT, (event) => this.acknowledge(event));
  }

  /**
   * Backpressure: the host keeps reading a shell's output only while this frame has few
   * events open, so a shell that writes fast waits instead of flooding the page. The SDK
   * acknowledges every event once the listeners have had it, in one request per session and
   * task.
   */
  private acknowledge(event: HaexHubEvent): void {
    const sessionId = (event.data as Partial<ShellOutputEvent> | undefined)?.sessionId;
    if (this.ackUnsupported || typeof sessionId !== "string") return;
    this.unacknowledged.set(sessionId, (this.unacknowledged.get(sessionId) ?? 0) + 1);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flushAcknowledgements());
  }

  private flushAcknowledgements(): void {
    this.flushScheduled = false;
    const counts = [...this.unacknowledged];
    this.unacknowledged.clear();
    for (const [sessionId, count] of counts) {
      this.sdk.request(SHELL_COMMANDS.ack, { sessionId, count }).catch((error: unknown) => {
        // An older host reads without backpressure; a closed session needs nothing.
        if (isUnsupported(error)) this.ackUnsupported = true;
      });
    }
  }

  /**
   * List available shell environments on the host system.
   * No filesystem permission required.
   */
  async listAvailable(): Promise<ShellInfo[]> {
    return await this.sdk.request<ShellInfo[]>(SHELL_COMMANDS.listAvailable, {});
  }

  /**
   * Create a new PTY shell session.
   * Returns a session ID used for subsequent write/resize/close operations.
   * Listen for shell output via `sdk.shell.onData()`.
   */
  async create(options: ShellCreateOptions = {}): Promise<ShellCreateResponse> {
    return await this.sdk.request<ShellCreateResponse>(
      SHELL_COMMANDS.create,
      { options }
    );
  }

  /**
   * Write data to a shell session's stdin.
   * Typically used to forward terminal keystrokes.
   */
  async write(sessionId: string, data: string): Promise<void> {
    await this.sdk.request(SHELL_COMMANDS.write, { sessionId, data });
  }

  /**
   * Resize a shell session's terminal.
   * Should be called when the terminal view is resized.
   */
  async resize(
    sessionId: string,
    cols: number,
    rows: number
  ): Promise<void> {
    await this.sdk.request(SHELL_COMMANDS.resize, { sessionId, cols, rows });
  }

  /**
   * Close a shell session.
   * This terminates the underlying PTY process.
   */
  async close(sessionId: string): Promise<void> {
    await this.sdk.request(SHELL_COMMANDS.close, { sessionId });
  }

  /**
   * Register a callback for shell output data.
   * The callback receives output from the PTY's stdout/stderr.
   */
  onData(callback: EventCallback): void {
    this.sdk.on("shell:output", callback);
  }

  /**
   * Register a callback for shell session exit.
   */
  onExit(callback: EventCallback): void {
    this.sdk.on("shell:exit", callback);
  }

  /**
   * Remove a shell output callback.
   */
  offData(callback: EventCallback): void {
    this.sdk.off("shell:output", callback);
  }

  /**
   * Remove a shell exit callback.
   */
  offExit(callback: EventCallback): void {
    this.sdk.off("shell:exit", callback);
  }
}
