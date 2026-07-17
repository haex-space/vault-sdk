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
 * Events for background mail-poll watches (`mail.startWatchingAsync`).
 */
export const MAIL_EVENTS = {
  /** A watched mailbox's UID high-water mark advanced — new mail arrived. */
  NEW_MESSAGES: 'mail:new-messages',
} as const;

export type MailEvent = typeof MAIL_EVENTS[keyof typeof MAIL_EVENTS];
