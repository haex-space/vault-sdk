/**
 * Console Forwarding Polyfill
 *
 * Forwards all console messages from the extension IFrame to the parent window
 * so they can be displayed in the HaexSpace console tab
 */

import { HAEXSPACE_MESSAGE_TYPES } from '../messages';

export interface ConsoleMessage {
  timestamp: string
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  message: string
}

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
}

function serializeArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg === null) return 'null'
      if (arg === undefined) return 'undefined'
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join(' ')
}

function interceptConsole(level: 'log' | 'info' | 'warn' | 'error' | 'debug') {
  console[level] = function (...args: unknown[]) {
    // Call original console method
    originalConsole[level].apply(console, args)

    // Forward to parent window if we're in an iframe
    if (window.self !== window.top && window.parent) {
      try {
        const message = serializeArgs(args)
        const timestamp = new Date().toLocaleTimeString()

        window.parent.postMessage(
          {
            type: HAEXSPACE_MESSAGE_TYPES.CONSOLE_FORWARD,
            data: {
              timestamp,
              level,
              message,
            },
            timestamp: Date.now(),
          },
          '*'
        )
      } catch (error) {
        // If forwarding fails, just log locally
        originalConsole.error('[HaexHub] Failed to forward console message:', error)
      }
    }
  }
}

export function installConsoleForwarding(debug: boolean = false): void {
  if (typeof window === 'undefined') {
    return
  }

  // Only install if we're in an iframe (extension context)
  if (window.self === window.top) {
    return
  }

  // Only install if debug mode is enabled
  if (!debug) {
    console.log('[HaexHub] Console forwarding disabled (not in debug mode)')
    return
  }

  interceptConsole('log')
  interceptConsole('info')
  interceptConsole('warn')
  interceptConsole('error')
  interceptConsole('debug')

  console.log('[HaexHub] Console forwarding installed')
}
