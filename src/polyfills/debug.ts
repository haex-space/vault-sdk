import { HAEXSPACE_MESSAGE_TYPES } from '../messages';

/**
 * Debug diagnostics for Android debugging
 * Tests window.parent availability and postMessage functionality
 */
export function installDebugDiagnostics(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const hasParent = window.parent && window.parent !== window;
  console.log('[HaexSpace] hasParent:', hasParent);

  if (hasParent) {
    console.log('[HaexSpace] Attempting to send debug message to parent...');
    window.parent.postMessage({
      type: HAEXSPACE_MESSAGE_TYPES.DEBUG,
      data: `[Polyfills] window.parent test: exists=${!!window.parent}, different=${hasParent}, selfIsTop=${window.self === window.top}`
    }, '*');
    console.log('[HaexSpace] Debug message sent!');
  } else {
    console.log('[HaexSpace] No parent window or parent === window');
  }
}
