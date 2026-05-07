/**
 * Mail Commands (IMAP fetch + SMTP send).
 *
 * Permissions are split protocol-wise: `fetch` covers all IMAP
 * operations (list/read/flag/move/append), `send` covers SMTP. Target
 * matches mail-server hostnames; subdomain match is supported, so
 * target="gmail.com" grants access to "imap.gmail.com" and
 * "smtp.gmail.com".
 *
 * Naming convention: `extension_mail_<action>`
 */

export const MAIL_COMMANDS = {
  /** LIST mailboxes + optional STATUS counts */
  listMailboxes: "extension_mail_list_mailboxes",
  /** Lightweight envelope fetch for list views */
  fetchEnvelopes: "extension_mail_fetch_envelopes",
  /** Full message fetch (envelope + body + attachment metadata) */
  fetchMessage: "extension_mail_fetch_message",
  /** Set or unset IMAP flags on a UID set */
  setFlags: "extension_mail_set_flags",
  /** MOVE messages between mailboxes (COPY+EXPUNGE fallback) */
  moveMessages: "extension_mail_move_messages",
  /** APPEND a base64-encoded RFC822 message into a mailbox */
  appendMessage: "extension_mail_append_message",
  /** SMTP send. Returns the assigned Message-ID. */
  sendMessage: "extension_mail_send_message",
  /** Build RFC822 bytes without sending (for Drafts via APPEND) */
  buildRfc822: "extension_mail_build_rfc822",
} as const;

export type MailCommand = (typeof MAIL_COMMANDS)[keyof typeof MAIL_COMMANDS];
