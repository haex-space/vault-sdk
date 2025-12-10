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

  /** External request from authorized client (browser extension, CLI, server, etc.) */
  EXTERNAL_REQUEST: 'haextension:external:request',
} as const;

export type HaextensionEvent = typeof HAEXTENSION_EVENTS[keyof typeof HAEXTENSION_EVENTS];
