import type { HaexVaultSdk } from "../client";
import type {
  FetchRange,
  ImapConfig,
  MailMessage,
  MailboxInfo,
  MessageEnvelope,
  OutgoingMessage,
  SmtpConfig,
} from "../types/mail";
import { MAIL_COMMANDS } from "../commands/mail";

/**
 * Mail operations through the host vault.
 *
 * Permission model:
 *  - All IMAP operations require `mail` permission with action `fetch`
 *    on `imap.host`.
 *  - SMTP send requires `mail` permission with action `send` on `smtp.host`.
 *  - target="gmail.com" matches "imap.gmail.com" / "smtp.gmail.com".
 *
 * Credentials live with the caller (typically loaded from
 * `client.passwords` and passed in per call). The SDK never persists
 * credentials.
 */
export class MailAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * LIST mailboxes for an IMAP account. Pass `includeStatus=true` for
   * EXISTS/UNSEEN/UIDVALIDITY/UIDNEXT per box (one extra round-trip
   * per mailbox — fine for typical accounts, expensive for large
   * trees).
   */
  async listMailboxesAsync(
    imap: ImapConfig,
    options: {
      reference?: string;
      pattern?: string;
      includeStatus?: boolean;
    } = {},
  ): Promise<MailboxInfo[]> {
    return this.client.request<MailboxInfo[]>(MAIL_COMMANDS.listMailboxes, {
      imap,
      reference: options.reference,
      pattern: options.pattern,
      includeStatus: options.includeStatus,
    });
  }

  /** Fetch lightweight envelopes for a mailbox + range (for list views). */
  async fetchEnvelopesAsync(
    imap: ImapConfig,
    mailbox: string,
    range: FetchRange,
  ): Promise<MessageEnvelope[]> {
    return this.client.request<MessageEnvelope[]>(
      MAIL_COMMANDS.fetchEnvelopes,
      { imap, mailbox, range },
    );
  }

  /** Fetch a full message (envelope + body + attachment metadata) by UID. */
  async fetchMessageAsync(
    imap: ImapConfig,
    mailbox: string,
    uid: number,
  ): Promise<MailMessage> {
    return this.client.request<MailMessage>(MAIL_COMMANDS.fetchMessage, {
      imap,
      mailbox,
      uid,
    });
  }

  /**
   * Fetch a single attachment's raw bytes by its `partIndex` (from the
   * `attachments` array of a fetched `MailMessage`), returned as a
   * standard-alphabet base64 string. The base64 form drops straight into
   * `OutgoingAttachment.data` when forwarding, and decodes to bytes for
   * viewing or downloading.
   */
  async fetchAttachmentAsync(
    imap: ImapConfig,
    mailbox: string,
    uid: number,
    partIndex: number,
  ): Promise<string> {
    return this.client.request<string>(MAIL_COMMANDS.fetchAttachment, {
      imap,
      mailbox,
      uid,
      partIndex,
    });
  }

  /**
   * Set or unset IMAP flags. Use `flags=["\\Seen"]` + `add=true` to
   * mark messages as read; `add=false` removes the flag(s).
   */
  async setFlagsAsync(
    imap: ImapConfig,
    mailbox: string,
    uids: number[],
    flags: string[],
    add: boolean,
  ): Promise<void> {
    return this.client.request<void>(MAIL_COMMANDS.setFlags, {
      imap,
      mailbox,
      uids,
      flags,
      add,
    });
  }

  /** Move messages between mailboxes. Falls back to COPY+EXPUNGE on servers without MOVE. */
  async moveMessagesAsync(
    imap: ImapConfig,
    sourceMailbox: string,
    destinationMailbox: string,
    uids: number[],
  ): Promise<void> {
    return this.client.request<void>(MAIL_COMMANDS.moveMessages, {
      imap,
      sourceMailbox,
      destinationMailbox,
      uids,
    });
  }

  /**
   * APPEND a base64-encoded RFC822 message into a mailbox. Combine
   * with `buildRfc822Async` to save drafts, or with the bytes returned
   * after `sendMessageAsync` to mirror the sent copy into "Sent".
   */
  async appendMessageAsync(
    imap: ImapConfig,
    mailbox: string,
    rfc822Base64: string,
    flags?: string[],
  ): Promise<void> {
    return this.client.request<void>(MAIL_COMMANDS.appendMessage, {
      imap,
      mailbox,
      rfc822Base64,
      flags,
    });
  }

  /** Send a message via SMTP. Returns the assigned Message-ID (no angle brackets). */
  async sendMessageAsync(
    smtp: SmtpConfig,
    message: OutgoingMessage,
  ): Promise<string> {
    return this.client.request<string>(MAIL_COMMANDS.sendMessage, {
      smtp,
      message,
    });
  }

  /**
   * Build RFC822 bytes for a message without sending — useful for
   * drafts that get APPENDed to a "Drafts" folder. Permission-wise
   * this is a fetch operation (no SMTP host involved).
   */
  async buildRfc822Async(
    imapHost: string,
    message: OutgoingMessage,
  ): Promise<string> {
    return this.client.request<string>(MAIL_COMMANDS.buildRfc822, {
      imapHost,
      message,
    });
  }
}
