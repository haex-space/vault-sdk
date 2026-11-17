import type { HaexVaultSdk } from "../client";
import { EXTENSION_COMMANDS } from "../commands/extension";
import { HAEXTENSION_EVENTS } from "../events";
import type { EventCallback } from "../types";
import type { HeaderDescription, HeaderEvent } from "../types/header";

/** The host's answer to a method it does not offer (holzi). */
const NOT_SUPPORTED = 8000;

/**
 * Whether the host does not offer the method: holzi answers code 8000, haex-vault 2.x a plain
 * `Unknown method: <method>` error.
 */
function isUnknownMethod(error: unknown): boolean {
  if ((error as { code?: number } | null)?.code === NOT_SUPPORTED) return true;
  const text = typeof error === "string" ? error : (error as { message?: unknown } | null)?.message;
  return typeof text === "string" && /^Unknown method\b/.test(text);
}

/**
 * The header of the host window that shows this extension.
 *
 * The host draws the description in the header of the extension's own tab (buttons, toggles, a
 * search field, menus, a breadcrumb), collapses it into an overflow menu when the window is
 * narrow, and tells the extension what the user did through `onEvent`. No permission is needed:
 * a call only changes the header of the calling frame's own tab. The header goes when the frame
 * reloads or closes.
 */
export class HeaderAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Replace the header with `description`. Resolves `true` when the host applied it, and `false`
   * when the host has no header (haex-vault 2.x); the extension keeps running either way. Every
   * other error rejects, such as `3001` for a description the host refuses (the previous header
   * stays).
   */
  async set(description: HeaderDescription): Promise<boolean> {
    try {
      await this.client.request<void>(EXTENSION_COMMANDS.headerSet, { ...description });
      return true;
    } catch (error) {
      if (isUnknownMethod(error)) return false;
      throw error;
    }
  }

  /** Listen for the user using a control of this extension's header. Returns an unsubscribe function. */
  onEvent(handler: (event: HeaderEvent) => void): () => void {
    const wrapped: EventCallback = (event) => {
      const data = (event as { data?: HeaderEvent }).data;
      if (data) handler(data);
    };
    this.client.on(HAEXTENSION_EVENTS.HEADER_EVENT, wrapped);
    return () => this.client.off(HAEXTENSION_EVENTS.HEADER_EVENT, wrapped);
  }
}
