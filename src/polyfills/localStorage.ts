/**
 * localStorage Polyfill for HaexSpace Extensions
 *
 * Provides an in-memory fallback when localStorage is blocked
 * due to custom protocol restrictions (haex-extension://)
 */

export function installLocalStoragePolyfill(): void {
  if (typeof window === 'undefined') {
    return; // Skip in Node.js environment
  }

  console.log('[HaexSpace] Storage Polyfill loading immediately');

  // Test if localStorage is available
  let localStorageWorks = false;
  try {
    const testKey = '__ls_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    localStorageWorks = true;
  } catch (e) {
    console.warn('[HaexSpace] localStorage blocked – using in-memory fallback');
  }

  // If blocked: Replace with In-Memory Storage
  if (!localStorageWorks) {
    const lsStorage = new Map<string, string>();

    const localStoragePoly: Storage = {
      getItem(key: string): string | null {
        return lsStorage.get(key) || null;
      },
      setItem(key: string, value: string): void {
        lsStorage.set(key, String(value));
      },
      removeItem(key: string): void {
        lsStorage.delete(key);
      },
      clear(): void {
        lsStorage.clear();
      },
      get length(): number {
        return lsStorage.size;
      },
      key(index: number): string | null {
        return Array.from(lsStorage.keys())[index] || null;
      }
    };

    try {
      Object.defineProperty(window, 'localStorage', {
        value: localStoragePoly,
        writable: true,
        configurable: true
      });
    } catch (e) {
      // Fallback: Direct assignment
      (window as any).localStorage = localStoragePoly;
    }

    console.log('[HaexSpace] localStorage replaced with in-memory polyfill');
  }
}

/**
 * sessionStorage Polyfill for HaexSpace Extensions
 *
 * Provides a no-op implementation as session state doesn't work
 * reliably in custom protocol contexts
 */
export function installSessionStoragePolyfill(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const sessionStoragePoly: Storage = {
      getItem(): null {
        return null;
      },
      setItem(): void {},
      removeItem(): void {},
      clear(): void {},
      get length(): number {
        return 0;
      },
      key(): null {
        return null;
      }
    };

    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStoragePoly,
      writable: true,
      configurable: true
    });
  } catch (e) {
    // Fallback: Direct assignment
    (window as any).sessionStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      get length() { return 0; },
      key: () => null
    };
  }

  console.log('[HaexSpace] sessionStorage polyfill installed');
}
