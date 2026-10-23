/**
 * Central event name definitions for HaexHub extensions
 *
 * Event Naming Schema: haextension:{subject}:{predicate}
 *
 * IMPORTANT: Tauri event names can only contain:
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Hyphens (-)
 * - Slashes (/)
 * - Colons (:)
 * - Underscores (_)
 *
 * NO dots (.) allowed!
 */

export const HAEXTENSION_EVENTS = {
  /** Context (theme, locale, platform) has changed */
  CONTEXT_CHANGED: 'haextension:context:changed',

  /** Search request from HaexHub */
  SEARCH_REQUEST: 'haextension:search:request',

  /** File system change detected (from native file watcher) */
  FILE_CHANGED: 'filesync:file-changed',

  /** Tables have been updated via sync (CRDT pull from server) */
  SYNC_TABLES_UPDATED: 'haextension:sync:tables-updated',

  /** A runtime permission prompt was resolved (granted/denied) by the user.
   *  The SDK uses this to auto-retry the original request; extensions may also
   *  subscribe via `client.on(HAEXTENSION_EVENTS.PERMISSION_RESOLVED, ...)`. */
  PERMISSION_RESOLVED: 'extension:permission-resolved',
} as const;

export type HaextensionEvent = typeof HAEXTENSION_EVENTS[keyof typeof HAEXTENSION_EVENTS];

/**
 * Events for the generic notifications API.
 */
export const NOTIFICATION_EVENTS = {
  /** A click on one of this extension's notifications (body or action button). */
  CLICK: 'haextension:notification:click',
} as const;

export type NotificationEvent = typeof NOTIFICATION_EVENTS[keyof typeof NOTIFICATION_EVENTS];

/**
 * Events of model jobs (`models.runAsync`, holzi spec 055).
 */
export const MODEL_JOB_EVENTS = {
  /** A job of this frame ended: completed, failed or cancelled. */
  COMPLETED: 'haextension:model-job:completed',
} as const;

export type ModelJobEvent = typeof MODEL_JOB_EVENTS[keyof typeof MODEL_JOB_EVENTS];

/**
 * Events of peer channels (`client.peers`, holzi spec 057). The SDK's
 * `peers.on` takes the names without the `peers:` prefix.
 */
export const PEERS_EVENTS = {
  /** The outcome of an invitation, once per invitation (inviting side). */
  INVITE_STATUS: 'peers:invite-status',
  /** A channel opened after the user accepted an invitation in holzi's prompt (invited side). */
  CHANNEL_OPENED: 'peers:channel-opened',
  /** A device joined one of this device's lobbies by code (host). */
  JOINED: 'peers:joined',
  /** A message on a channel; `data` is Base64 on the bridge. */
  MESSAGE: 'peers:message',
  /** A channel ended: closed, lost or timed out. */
  CHANNEL_CLOSED: 'peers:channel-closed',
} as const;

export type PeersEvent = typeof PEERS_EVENTS[keyof typeof PEERS_EVENTS];

/**
 * Events for external client communication (browser extensions, CLI tools, servers, etc.)
 */
export const EXTERNAL_EVENTS = {
  /** External request from authorized client */
  REQUEST: 'haextension:external:request',

  /** AI action request (tool calls from AI assistant) */
  ACTION_REQUEST: 'haextension:action:request',

  /** New external client requesting authorization */
  AUTHORIZATION_REQUEST: 'external:authorization-request',
} as const;

export type ExternalEvent = typeof EXTERNAL_EVENTS[keyof typeof EXTERNAL_EVENTS];

/**
 * Events for shell/PTY sessions
 */
export const SHELL_EVENTS = {
  /** PTY output data from a shell session */
  OUTPUT: 'shell:output',

  /** Shell session has exited */
  EXIT: 'shell:exit',
} as const;

export type ShellEvent = typeof SHELL_EVENTS[keyof typeof SHELL_EVENTS];

/**
 * Events for background mail watches (`mail.startWatchingAsync`).
 */
export const MAIL_EVENTS = {
  /** A watched mailbox's UID high-water mark advanced — new mail arrived. */
  NEW_MESSAGES: 'mail:new-messages',
} as const;

export type MailEvent = typeof MAIL_EVENTS[keyof typeof MAIL_EVENTS];
