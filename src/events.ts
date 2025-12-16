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
} as const;

export type HaextensionEvent = typeof HAEXTENSION_EVENTS[keyof typeof HAEXTENSION_EVENTS];

/**
 * Events for external client communication (browser extensions, CLI tools, servers, etc.)
 */
export const EXTERNAL_EVENTS = {
  /** External request from authorized client */
  REQUEST: 'haextension:external:request',

  /** New external client requesting authorization */
  AUTHORIZATION_REQUEST: 'external:authorization-request',
} as const;

export type ExternalEvent = typeof EXTERNAL_EVENTS[keyof typeof EXTERNAL_EVENTS];
