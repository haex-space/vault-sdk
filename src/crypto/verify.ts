// @haexhub/sdk/src/crypto/verify.ts
// Browser-compatible signature verification for extension bundles

import type { ExtensionManifest } from '~/types';

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export interface ZipFileEntry {
  path: string;
  content: Uint8Array;
}

/**
 * Sort object keys recursively for canonical JSON representation.
 * Must match the signing implementation exactly.
 */
export function sortObjectKeysRecursively(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sortObjectKeysRecursively(item));
  }

  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((result: Record<string, unknown>, key) => {
      result[key] = sortObjectKeysRecursively((obj as Record<string, unknown>)[key]);
      return result;
    }, {});
}

/**
 * Convert hex string to ArrayBuffer
 * Returns ArrayBuffer directly to avoid type issues with Uint8Array.buffer
 */
export function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  // Return the underlying ArrayBuffer directly
  // Since we created a new Uint8Array, buffer is the exact size we need
  return bytes.buffer as ArrayBuffer;
}

/**
 * Verify Ed25519 signature of an extension bundle.
 *
 * This function is browser-compatible and uses the Web Crypto API.
 * It verifies that the extension bundle was signed with the private key
 * corresponding to the public key in the manifest.
 *
 * @param files - Array of file entries from the ZIP archive
 * @param manifest - The extension manifest (parsed from manifest.json)
 * @returns Promise resolving to verification result
 *
 * @example
 * ```typescript
 * import JSZip from 'jszip';
 * import { verifyExtensionSignature } from '@haex-space/vault-sdk';
 *
 * const zip = await JSZip.loadAsync(bundleFile);
 * const manifestContent = await zip.file('haextension/manifest.json')?.async('string');
 * const manifest = JSON.parse(manifestContent);
 *
 * // Collect all files from the ZIP
 * const files = [];
 * for (const [path, entry] of Object.entries(zip.files)) {
 *   if (!entry.dir) {
 *     files.push({ path, content: await entry.async('uint8array') });
 *   }
 * }
 *
 * const result = await verifyExtensionSignature(files, manifest);
 * if (!result.valid) {
 *   console.error('Signature verification failed:', result.error);
 * }
 * ```
 */
export async function verifyExtensionSignature(
  files: ZipFileEntry[],
  manifest: ExtensionManifest
): Promise<VerifyResult> {
  try {
    // Check if WebCrypto is available
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return { valid: false, error: 'WebCrypto API not available' };
    }

    const { publicKey: publicKeyHex, signature: signatureHex } = manifest;

    // Validate required fields
    if (!publicKeyHex) {
      return { valid: false, error: 'Missing publicKey in manifest' };
    }
    if (!signatureHex) {
      return { valid: false, error: 'Missing signature in manifest' };
    }

    // Validate hex format
    if (!/^[0-9a-fA-F]+$/.test(publicKeyHex)) {
      return { valid: false, error: 'Invalid publicKey format (must be hex)' };
    }
    if (!/^[0-9a-fA-F]+$/.test(signatureHex)) {
      return { valid: false, error: 'Invalid signature format (must be hex)' };
    }

    // Import public key from hex
    const publicKeyBuffer = hexToBytes(publicKeyHex);
    let publicKey: CryptoKey;
    try {
      publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBuffer,
        { name: 'Ed25519', namedCurve: 'Ed25519' } as EcKeyImportParams,
        false,
        ['verify']
      );
    } catch (err) {
      // Ed25519 might not be supported in all browsers
      return {
        valid: false,
        error: `Failed to import public key: ${err instanceof Error ? err.message : 'Ed25519 may not be supported in this browser'}`
      };
    }

    // Recreate the manifest as it was during signing (with empty signature)
    const manifestForHashing = sortObjectKeysRecursively({
      ...manifest,
      signature: '',
    }) as Record<string, unknown>;

    // Prepare files for hashing
    // Replace manifest.json content with the canonical version (empty signature)
    const manifestJson = JSON.stringify(manifestForHashing, null, 2);
    const manifestBytes = new TextEncoder().encode(manifestJson);

    const filesForHashing: ZipFileEntry[] = files.map(file => {
      if (file.path === 'haextension/manifest.json') {
        return { path: file.path, content: manifestBytes };
      }
      return file;
    });

    // Sort files alphabetically by path (byte-order, same as CLI signing process)
    filesForHashing.sort((a, b) => {
      if (a.path < b.path) return -1;
      if (a.path > b.path) return 1;
      return 0;
    });

    // Concatenate all file contents
    const totalLength = filesForHashing.reduce((sum, f) => sum + f.content.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const file of filesForHashing) {
      combined.set(file.content, offset);
      offset += file.content.length;
    }

    // Compute SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);

    // Verify signature
    const signatureBuffer = hexToBytes(signatureHex);
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signatureBuffer,
      hashBuffer
    );

    return { valid: isValid };
  } catch (err) {
    console.error('Signature verification error:', err);
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Unknown verification error'
    };
  }
}
