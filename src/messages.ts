/**
 * Central message type definitions for HaexSpace SDK
 *
 * Message Naming Schema: haexspace:{subject}
 *
 * These are used for internal communication between extensions and HaexSpace
 */

export const HAEXSPACE_MESSAGE_TYPES = {
  /** Debug message for development/troubleshooting */
  DEBUG: 'haexspace:debug',

  /** Console forwarding from extension iframe */
  CONSOLE_FORWARD: 'console.forward',
} as const;

export type HaexspaceMessageType =
  (typeof HAEXSPACE_MESSAGE_TYPES)[keyof typeof HAEXSPACE_MESSAGE_TYPES];
