/**
 * Mail types — IMAP fetch + SMTP send.
 *
 * Mirrors the Rust types in `src-tauri/src/mail/types.rs`. Permission
 * is scoped by the `mail` resource type with `target` = mail-server
 * hostname (subdomain match supported, so target="gmail.com" matches
 * "imap.gmail.com" and "smtp.gmail.com").
 */

export type ConnectionSecurity = "tls" | "startTls" | "none";

export interface ImapConfig {
  host: string;
  port: number;
  security: ConnectionSecurity;
  username: string;
  password: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  security: ConnectionSecurity;
  username: string;
  password: string;
}

/** A mail account. SMTP is optional (fetch-only is valid). */
export interface MailAccount {
  id: string;
  imap: ImapConfig;
  smtp?: SmtpConfig;
}

export interface MailAddress {
  name?: string;
  email: string;
}

export interface MailboxInfo {
  name: string;
  delimiter?: string;
  flags: string[];
  exists?: number;
  unseen?: number;
  uidValidity?: number;
  uidNext?: number;
}

export interface MessageEnvelope {
  uid: number;
  flags: string[];
  /** Server-side internal date as Unix timestamp (seconds). */
  internalDate?: number;
  subject?: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  size?: number;
}

export interface Attachment {
  partIndex: number;
  filename?: string;
  contentType: string;
  size: number;
  contentId?: string;
  isInline: boolean;
}

export interface MailMessage {
  envelope: MessageEnvelope;
  bodyText?: string;
  bodyHtml?: string;
  attachments: Attachment[];
}

/** Selector for fetch operations. */
export type FetchRange =
  | { type: "latest"; count: number }
  | { type: "uidRange"; start: number; end: number }
  | { type: "uidList"; uids: number[] };

export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  /** Base64-encoded bytes (standard alphabet, with padding). */
  data: string;
  /** If set, the part is marked inline and referenced via `cid:` in HTML. */
  contentId?: string;
}

export interface OutgoingMessage {
  from: MailAddress;
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  replyTo?: MailAddress;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: OutgoingAttachment[];
  /** Message-ID being replied to. Sets `In-Reply-To` header. */
  inReplyTo?: string;
  /** Threading chain. Sets `References` header. */
  references?: string[];
}
