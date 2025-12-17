/**
 * Vue 3 Integration for HaexVault SDK
 *
 * Provides a Vue composable that automatically creates reactive refs
 * for extension info and application context.
 *
 * @example
 * ```typescript
 * import { useHaexVaultSdk } from '@haex-space/vault-sdk/vue';
 *
 * const { extensionInfo, context, db, storage } = useHaexVaultSdk();
 *
 * // Use directly in templates - automatically reactive!
 * console.log(extensionInfo.value);
 * console.log(context.value);
 * ```
 */

import { ref, readonly } from 'vue';
import type { Ref } from 'vue';
import { createHaexVaultClient } from './index';
import { HaexVaultClient } from './client';
import type { ExtensionInfo, ApplicationContext, HaexHubConfig } from './types';

// Shared reactive SDK instance - initialized once at module level
let clientInstance: HaexVaultClient | null = null;
let extensionInfo: Ref<ExtensionInfo | null> | null = null;
let context: Ref<ApplicationContext | null> | null = null;
let isSetupComplete: Ref<boolean> | null = null;

/**
 * Vue 3 composable for HaexVault SDK
 *
 * Creates a singleton SDK client with reactive properties that automatically
 * update when the SDK receives new data from the parent application.
 *
 * @param config - Optional SDK configuration
 * @returns Reactive SDK instance with extensionInfo, context, db, and storage
 */
export function useHaexVaultSdk(config: HaexHubConfig = {}) {
  // Initialize SDK only once
  if (!clientInstance) {
    clientInstance = createHaexVaultClient(config);
    extensionInfo = ref<ExtensionInfo | null>(clientInstance.extensionInfo);
    context = ref<ApplicationContext | null>(clientInstance.context);
    isSetupComplete = ref<boolean>(false);

    // Subscribe to SDK changes and update reactive refs
    clientInstance.subscribe(() => {
      if (extensionInfo) {
        extensionInfo.value = clientInstance!.extensionInfo;
      }
      if (context) {
        context.value = clientInstance!.context;
      }
      if (isSetupComplete) {
        isSetupComplete.value = clientInstance!.setupCompleted;
      }
    });

    // Note: We DON'T call setupComplete() automatically anymore!
    // The extension must call it after registering the setup hook.
    // This prevents race conditions where setupComplete() is called before the hook is registered.
  }

  return {
    client: clientInstance,
    extensionInfo: readonly(extensionInfo!),
    context: readonly(context!),
    isSetupComplete: readonly(isSetupComplete!),
    db: clientInstance.orm,
    storage: clientInstance.storage,
    getTableName: clientInstance.getTableName.bind(clientInstance),
  };
}

/**
 * Get the raw HaexVault SDK client instance (non-reactive)
 * Useful for direct API calls without Vue reactivity overhead
 */
export function getHaexVaultSdk(): HaexVaultClient | null {
  return clientInstance;
}
