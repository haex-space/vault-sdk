import type { HaexVaultSdk } from "../client";
import { NOTIFICATION_COMMANDS } from "../commands/notifications";
import { NOTIFICATION_EVENTS } from "../events";
import type { EventCallback } from "../types";

/**
 * A deep link into the calling extension. `path` is an extension-internal
 * route (e.g. "/event/abc-123" or "/inbox/msg/xyz").
 *
 * The notification carrying this link is pinned to the calling extension's
 * public key by the host. Clicks can only route to webviews with that same
 * public key — there is intentionally no `extensionId` field, so notifications
 * can never deep-link into a *different* extension.
 */
export type DeepLink = {
  path: string;
};

/** An action button on a notification. */
export type NotificationAction = {
  /** Stable id, returned in the click event. */
  id: string;
  /** Button text (the caller localises it). */
  label: string;
  /** Where a click on this button routes. */
  deepLink: DeepLink;
};

export type NotificationOptions = {
  title: string;
  body?: string;
  /** Optional icon override; default = the extension's manifest icon. */
  icon?: string;
  /** Click on the notification body → navigate here. */
  primary?: DeepLink;
  /**
   * Up to 3 action buttons (platform-dependent; extra buttons and, on some
   * platforms, all buttons degrade silently — the `primary` link still works).
   */
  actions?: NotificationAction[];
  /** Dedupe key — showing again with the same tag replaces the previous one. */
  tag?: string;
};

/** Payload delivered to {@link NotificationsAPI.onClick} handlers. */
export type NotificationClickEvent = {
  /** Id of the clicked notification (the value returned by `show`). */
  notificationId: string;
  /** Id of the clicked action button, or undefined for a body click. */
  actionId?: string;
  /**
   * Resolved deep-link path for the click (the `primary` path for a body
   * click, or the action's `deepLink.path`), if one was set.
   */
  path?: string;
};

/**
 * Generic OS notifications, bridged through the host vault.
 *
 * Permission model: requires the `notifications` permission with action
 * `show`. The host assigns and pins the extension's public key on every
 * `show()` — the extension never supplies or sees its key here.
 *
 * Platform reality (the notification itself always shows; routing varies):
 *  - Click → deep-link routing and action buttons depend on the host's OS
 *    notification backend. Where the backend reports no click, the body and
 *    buttons simply don't route; the notification is still displayed.
 */
export class NotificationsAPI {
  constructor(private client: HaexVaultSdk) {}

  /** Show a notification. Returns its id so it can be dismissed later. */
  async show(opts: NotificationOptions): Promise<{ id: string }> {
    return this.client.request<{ id: string }>(NOTIFICATION_COMMANDS.show, {
      options: opts,
    });
  }

  /** Dismiss a previously shown notification (only own notifications). */
  async dismiss(id: string): Promise<void> {
    return this.client.request<void>(NOTIFICATION_COMMANDS.dismiss, { id });
  }

  /**
   * Listen for clicks on this extension's notifications. Useful when the
   * extension is already open and wants to react in-app (e.g. router.push the
   * `path`) instead of relying on the host to focus the webview.
   *
   * Returns an unsubscribe function.
   */
  onClick(handler: (e: NotificationClickEvent) => void): () => void {
    const wrapped: EventCallback = (event) => {
      const data = (event as { data?: NotificationClickEvent }).data;
      if (data) handler(data);
    };
    this.client.on(NOTIFICATION_EVENTS.CLICK, wrapped);
    return () => this.client.off(NOTIFICATION_EVENTS.CLICK, wrapped);
  }
}
