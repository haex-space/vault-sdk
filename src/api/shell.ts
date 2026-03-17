import type { HaexVaultSdk } from "../client";
import type { EventCallback } from "../types";
import { SHELL_COMMANDS } from "../commands/shell";

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
}

export interface ShellOutputEvent {
  sessionId: string;
  data: string;
}

export interface ShellExitEvent {
  sessionId: string;
  exitCode: number | null;
}

export class ShellAPI {
  constructor(private readonly sdk: HaexVaultSdk) {}

  /**
   * Create a new PTY shell session.
   * Returns a session ID used for subsequent write/resize/close operations.
   * Listen for shell output via `sdk.shell.onData()`.
   */
  async create(options: ShellCreateOptions = {}): Promise<string> {
    const result = await this.sdk.request<ShellCreateResponse>(
      SHELL_COMMANDS.create,
      { options }
    );
    return result.sessionId;
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
