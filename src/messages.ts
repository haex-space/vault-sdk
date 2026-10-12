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

  /**
   * Sent from main window to iframe on the shared window listener, carrying
   * one `MessagePort` in `event.ports[0]`. Once received, the SDK switches
   * to port-based messaging and never reads the window listener again.
   *
   * Payload: `{ type: PORT_INIT }` — no data. The port itself is the payload.
   */
  PORT_INIT: 'haexspace:port:init',

  /**
   * Sent from SDK to main window *over the MessagePort* after the port is
   * installed. Main uses this to mark the iframe as ready and flush any
   * events buffered during the handshake window. Only valid on the port —
   * a READY sent over window.postMessage is ignored.
   *
   * Payload: `{ type: PORT_READY }` — no data.
   */
  PORT_READY: 'haexspace:port:ready',

  /**
   * One MCP message of the tool connection (holzi spec 018), in both directions over the
   * MessagePort: the host calls the extension's tools, `sdk.tools` answers.
   *
   * Payload: `{ type: MCP, message }`, where `message` is a JSON-RPC 2.0 object.
   */
  MCP: 'haexspace:mcp',
} as const;

export type HaexspaceMessageType =
  (typeof HAEXSPACE_MESSAGE_TYPES)[keyof typeof HAEXSPACE_MESSAGE_TYPES];
