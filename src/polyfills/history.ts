/**
 * History API Polyfill for HaexSpace Extensions
 *
 * Works around SecurityError when using pushState/replaceState
 * in custom protocol contexts (haex-extension://)
 *
 * Falls back to hash-based routing when necessary
 */

export function installHistoryPolyfill(): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') {
    return; // Skip in Node.js environment
  }

  // Install after DOM is ready to avoid race conditions
  const install = () => {
    console.log('[HaexSpace] History Patch loading');

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    let skipNextPush = false;
    let skipNextReplace = false;

    // Patch pushState
    history.pushState = function(
      state: any,
      title: string,
      url?: string | URL | null
    ): void {
      console.log('[HaexSpace] pushState called:', url, 'skip:', skipNextPush);

      if (skipNextPush) {
        skipNextPush = false;
        console.log('[HaexSpace] pushState skipped');
        return;
      }

      try {
        return originalPushState.call(this, state, title, url);
      } catch (e) {
        if ((e as Error).name === 'SecurityError' && url) {
          // Remove duplicate /#/ prefix
          const urlString = url.toString();
          let hashUrl = urlString.replace(/^\/#/, '');
          hashUrl = hashUrl.startsWith('#') ? hashUrl : '#' + hashUrl;
          console.log('[HaexSpace] SecurityError - setting hash to:', hashUrl);
          skipNextPush = true;
          window.location.hash = hashUrl.replace(/^#/, '');
          return; // Silent fallback
        }
        throw e;
      }
    };

    // Patch replaceState
    history.replaceState = function(
      state: any,
      title: string,
      url?: string | URL | null
    ): void {
      console.log('[HaexSpace] replaceState called:', url, 'skip:', skipNextReplace);

      if (skipNextReplace) {
        skipNextReplace = false;
        console.log('[HaexSpace] replaceState skipped');
        return;
      }

      try {
        return originalReplaceState.call(this, state, title, url);
      } catch (e) {
        if ((e as Error).name === 'SecurityError' && url) {
          // Remove duplicate /#/ prefix
          const urlString = url.toString();
          let hashUrl = urlString.replace(/^\/#/, '');
          hashUrl = hashUrl.startsWith('#') ? hashUrl : '#' + hashUrl;
          console.log('[HaexSpace] SecurityError - setting hash to:', hashUrl);
          skipNextReplace = true;
          window.location.hash = hashUrl.replace(/^#/, '');
          return; // Silent fallback
        }
        throw e;
      }
    };

    console.log('[HaexSpace] History API patched');
  };

  // Install after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    // DOM already loaded, install immediately
    install();
  }
}
