/**
 * React Integration for HaexVault SDK
 *
 * Provides a React hook that automatically creates reactive state
 * for extension info and application context.
 *
 * @example
 * ```typescript
 * import { useHaexVaultSdk } from '@haex-space/vault-sdk/react';
 *
 * function MyComponent() {
 *   const { extensionInfo, context, db, storage } = useHaexVaultSdk();
 *
 *   // Use directly in JSX - automatically reactive!
 *   return <div>{extensionInfo?.name}</div>;
 * }
 * ```
 */

import { useState, useEffect } from 'react';
import { createHaexVaultClient } from './index';
import { HaexVaultClient } from './client';
import type { ExtensionInfo, ApplicationContext, HaexHubConfig } from './types';

// Shared SDK client instance - initialized once at module level
let clientInstance: HaexVaultClient | null = null;

/**
 * React hook for HaexVault SDK
 *
 * Creates a singleton SDK client with reactive state that automatically
 * updates when the SDK receives new data from the parent application.
 *
 * @param config - Optional SDK configuration
 * @returns SDK instance with extensionInfo, context, db, and storage
 */
export function useHaexVaultSdk(config: HaexHubConfig = {}) {
  // Initialize SDK only once
  if (!clientInstance) {
    clientInstance = createHaexVaultClient(config);
  }

  const [extensionInfo, setExtensionInfo] = useState<ExtensionInfo | null>(
    clientInstance.extensionInfo
  );
  const [context, setContext] = useState<ApplicationContext | null>(
    clientInstance.context
  );
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  useEffect(() => {
    // Subscribe to SDK changes
    const unsubscribe = clientInstance!.subscribe(() => {
      setExtensionInfo(clientInstance!.extensionInfo);
      setContext(clientInstance!.context);
      setIsSetupComplete(clientInstance!.setupCompleted);
    });

    // Initial sync in case data loaded before component mounted
    setExtensionInfo(clientInstance!.extensionInfo);
    setContext(clientInstance!.context);
    setIsSetupComplete(clientInstance!.setupCompleted);

    // Note: We DON'T call setupComplete() automatically anymore!
    // The extension must call it after registering the setup hook.
    // This prevents race conditions where setupComplete() is called before the hook is registered.

    return unsubscribe;
  }, []);

  return {
    client: clientInstance,
    extensionInfo,
    context,
    isSetupComplete,
    db: clientInstance.orm,
    storage: clientInstance.storage,
    getTableName: clientInstance.getTableName.bind(clientInstance),
  };
}

/**
 * Get the raw HaexVault SDK client instance (non-reactive)
 * Useful for direct API calls without React state overhead
 */
export function getHaexVaultSdk(): HaexVaultClient | null {
  return clientInstance;
}
