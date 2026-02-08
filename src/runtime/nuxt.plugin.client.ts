import { defineNuxtPlugin } from "nuxt/app";
import { shallowRef, type ShallowRef } from "vue";
import { HaexVaultSdk } from "~/client";
import type { ExtensionManifest, ApplicationContext } from "~/types";

export default defineNuxtPlugin(async (nuxtApp) => {
  // Get manifest from runtime config (injected by Nuxt module)
  const manifest = nuxtApp.$config.public.haexVaultManifest as ExtensionManifest | null;

  // 1. Create the client instance
  const client = new HaexVaultSdk({
    // @ts-expect-error - nuxtApp.payload.config may not have proper types
    debug: nuxtApp.payload.config.public.debug ?? false,
    manifest: manifest || undefined,
  });

  // 2. Create a reactive container (shallowRef is performant)
  const state = shallowRef({
    isReady: false,
    isSetupComplete: false,
    context: client.context,
  });

  // 3. Warte auf die Initialisierung des Clients
  await client.ready();

  // 4. Setze den initialen State, sobald der Client bereit ist
  console.log('[Nuxt Plugin] Client ready, context:', client.context);
  state.value = {
    isReady: true,
    isSetupComplete: false,
    context: client.context,
  };
  console.log('[Nuxt Plugin] Initial state set:', state.value);

  // 5. Nutze dein Pub/Sub-Pattern, um auf künftige Updates zu lauschen
  client.subscribe(() => {
    console.log('[Nuxt Plugin] Client context updated:', client.context);

    // Check if setup was completed (setupCompleted is set by client.setupComplete())
    const isSetupComplete = client.setupCompleted;

    // Triggere ein Update für das shallowRef
    state.value = {
      ...state.value,
      context: client.context,
      isSetupComplete,
    };
    console.log('[Nuxt Plugin] State updated:', state.value);
  });

  // 6. Note: We DON'T call setupComplete() automatically anymore!
  // The extension must call it after registering the setup hook.
  // This prevents race conditions where setupComplete() is called before the hook is registered.

  // 7. Stelle den Client und den reaktiven State bereit
  const haexVaultPlugin = {
    client, // Der rohe Client (für client.orm, client.database, etc.)
    state, // Der reaktive State (für die UI)
  };

  return {
    provide: {
      haexVault: haexVaultPlugin,
    },
  };
});

// Export type for type declarations
export type HaexVaultNuxtPlugin = {
  client: HaexVaultSdk;
  state: ShallowRef<{
    isReady: boolean;
    isSetupComplete: boolean;
    context: ApplicationContext | null;
  }>;
};
