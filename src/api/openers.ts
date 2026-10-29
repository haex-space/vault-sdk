import type { HaexVaultSdk } from "../client";
import { EXTENSION_COMMANDS } from "../commands/extension";
import { OPENER_EVENTS } from "../events";
import type { EventCallback } from "../types";

/** The fields of the e-mail a person wants to write, as the host read them from a mail link or an address. */
export interface MailFields {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** Plain text; line breaks are `\n`. */
  body: string;
}

/** The request a person gave this extension. The host never passes the link itself, only these fields. */
export type OpenRequest = { action: "mail.compose"; mail: MailFields };

/**
 * Requests the host hands to an extension that registered as an opener (`openers` in its manifest,
 * holzi spec 063). A request exists only because the person chose this extension, and it is taken
 * exactly once.
 *
 * Open the dialog the request asks for, but do not send anything: the person has not written it yet.
 */
export class OpenersAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Takes the request that waits for this extension, or `null` when none does (it expired after
   * 15 seconds, was taken already, or the extension did not register for the kind). Call it once when
   * the extension starts: a frame that the choice itself opened misses the event.
   */
  async take(): Promise<OpenRequest | null> {
    const request = await this.client.request<OpenRequest | null>(EXTENSION_COMMANDS.openerTake, {});
    return request ?? null;
  }

  /**
   * Calls `handler` with each request that arrives while the extension is open; the SDK takes it
   * for you. Returns an unsubscribe function.
   */
  onRequest(handler: (request: OpenRequest) => void): () => void {
    const wrapped: EventCallback = () => {
      void this.take().then((request) => {
        if (request) handler(request);
      });
    };
    this.client.on(OPENER_EVENTS.REQUEST, wrapped);
    return () => this.client.off(OPENER_EVENTS.REQUEST, wrapped);
  }
}
