/**
 * Cookie Polyfill for HaexSpace Extensions
 *
 * Provides an in-memory cookie implementation when cookies are blocked
 * due to custom protocol restrictions (haex-extension://)
 */

export function installCookiePolyfill(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return; // Skip in Node.js environment
  }

  // Test if cookies are available
  let cookiesWork = false;
  try {
    document.cookie = "__cookie_test__=1";
    cookiesWork = document.cookie.indexOf("__cookie_test__") !== -1;
  } catch {
    console.warn("[HaexSpace] Cookies blocked – using in-memory fallback");
  }

  if (!cookiesWork) {
    const cookieStore = new Map<string, string>();

    Object.defineProperty(document, "cookie", {
      get(): string {
        const cookies: string[] = [];
        cookieStore.forEach((value, key) => {
          cookies.push(`${key}=${value}`);
        });
        return cookies.join("; ");
      },
      set(cookieString: string): void {
        const parts = cookieString.split(";").map((p) => p.trim());
        const [keyValue] = parts;

        if (!keyValue) return;

        const [key, value] = keyValue.split("=");
        if (!key) return;

        // Parse options
        const options: Record<string, string | boolean> = {};
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (!part) continue;
          const parts_split = part.split("=");
          const optKey = parts_split[0];
          const optValue = parts_split[1];
          if (optKey) {
            options[optKey.toLowerCase()] = optValue || true;
          }
        }

        // Check for deletion (expires in past)
        const expiresValue = options.expires;
        if (expiresValue && typeof expiresValue === "string") {
          const expiresDate = new Date(expiresValue);
          if (expiresDate < new Date()) {
            cookieStore.delete(key);
            return;
          }
        }

        // Check for max-age=0 deletion
        const maxAgeValue = options["max-age"];
        if (typeof maxAgeValue === "string" && maxAgeValue === "0") {
          cookieStore.delete(key);
          return;
        }

        // Store cookie
        cookieStore.set(key, value || "");
      },
      configurable: true,
    });

    console.log("[HaexSpace] Cookie polyfill installed");
  }
}
