/**
 * Notifications Commands
 *
 * Generic OS-notification bridge. Extensions can't fire OS notifications
 * themselves (no host privileges), so they go through the vault. Every
 * notification is pinned to the calling extension's public key by the host;
 * deep-link clicks can only route back to a webview with that same key.
 *
 * Permission: `notifications` resource, action `show`, target `*`.
 *
 * Naming convention: `extension_notifications_<action>`
 */

export const NOTIFICATION_COMMANDS = {
  /** Show an OS notification. Returns the assigned notification id. */
  show: "extension_notifications_show",
  /** Dismiss a previously shown notification (only own notifications). */
  dismiss: "extension_notifications_dismiss",
} as const;

export type NotificationCommand =
  (typeof NOTIFICATION_COMMANDS)[keyof typeof NOTIFICATION_COMMANDS];
