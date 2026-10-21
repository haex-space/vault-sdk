/**
 * Mail Commands (IMAP fetch + SMTP send).
 *
 * Permissions are split protocol-wise: `fetch` covers all IMAP
 * operations (list/read/search/flag/move/append/create/delete), `send` covers SMTP, `poll`
 * covers background new-mail watching (startWatch/stopWatch). Target
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
  /** Fetch a single attachment's bytes (base64) by part index */
  fetchAttachment: "extension_mail_fetch_attachment",
  /** Search a mailbox on the server by criteria; answers UIDs, newest first */
  search: "extension_mail_search",
  /** CREATE a mailbox (reports whether it was already there) */
  createMailbox: "extension_mail_create_mailbox",
  /** Delete messages for good: `\Deleted` plus UID EXPUNGE of exactly those UIDs */
  deleteMessages: "extension_mail_delete_messages",
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
  /** Start (or replace) a background new-mail watch for an account/mailbox */
  startWatch: "extension_mail_start_watch",
  /** Stop a background new-mail watch */
  stopWatch: "extension_mail_stop_watch",
} as const;

export type MailCommand = (typeof MAIL_COMMANDS)[keyof typeof MAIL_COMMANDS];
