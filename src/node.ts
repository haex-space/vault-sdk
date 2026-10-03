/**
 * Node.js-only utilities
 * These utilities use fs and path, so they can only be used in Node.js environments (CLI, build tools, etc.)
 */

export {
  readHaextensionConfig,
  getExtensionDir,
  type HaextensionConfig,
} from './config';

export {
  readManifest,
  type ReadManifestOptions,
} from './manifest';

export type { ExtensionManifest } from './types';

// Bundle format `haextension-bundle/2` (WebAssembly build of crates/haex-bundle)
export {
  BUNDLE_ERROR_KINDS,
  BUNDLE_FILE_EXTENSION,
  BundleError,
  buildBundle,
  maxBundleBytes,
  verifyBundle,
  type BundleEntry,
  type BundleErrorKind,
  type SignedFile,
  type VerifiedBundle,
} from './bundle';
