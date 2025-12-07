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
