/**
 * Utility for reading and processing extension manifest files
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { ExtensionManifest } from "./types";

export interface ReadManifestOptions {
  /** Root directory of the project */
  rootDir: string;
  /** Path to manifest.json (if not provided, will use extensionDir) */
  manifestPath?: string;
  /** Directory containing extension files (default: "haextension") */
  extensionDir?: string;
}

/**
 * Reads and processes the extension manifest.json file
 * Falls back to package.json version if manifest doesn't specify one
 */
export function readManifest(options: ReadManifestOptions): ExtensionManifest | null {
  const { rootDir, manifestPath, extensionDir = "haextension" } = options;

  // Determine manifest path
  const resolvedManifestPath = manifestPath
    ? resolvePath(rootDir, manifestPath)
    : resolvePath(rootDir, extensionDir, "manifest.json");

  try {
    const manifestContent = readFileSync(resolvedManifestPath, "utf-8");
    const parsed: Partial<ExtensionManifest> = JSON.parse(manifestContent);

    // Read fallback values from package.json
    let packageJson: { name?: string; version?: string; author?: string; homepage?: string } = {};
    try {
      const packageJsonPath = resolvePath(rootDir, "package.json");
      packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    } catch (pkgError) {
      console.warn(`[@haexhub/sdk] Warning: Could not read package.json`);
    }

    // Use manifest values with fallback to package.json
    const name = parsed.name ?? packageJson.name;
    const version = parsed.version ?? packageJson.version;
    const author = parsed.author ?? packageJson.author ?? null;
    const homepage = parsed.homepage ?? packageJson.homepage ?? null;

    if (!name) {
      console.warn(`[@haexhub/sdk] Warning: No name found in manifest or package.json`);
      return null;
    }

    if (!version) {
      console.warn(`[@haexhub/sdk] Warning: No version found in manifest or package.json`);
      return null;
    }

    const manifest: ExtensionManifest = {
      name,
      version,
      author,
      entry: parsed.entry ?? null,
      icon: parsed.icon ?? null,
      publicKey: parsed.publicKey ?? "",
      signature: parsed.signature ?? "",
      permissions: parsed.permissions ?? {
        database: [],
        filesystem: [],
        http: [],
        shell: [],
      },
      homepage,
      description: parsed.description ?? null,
      singleInstance: parsed.singleInstance ?? null,
      displayMode: parsed.displayMode ?? null,
      migrationsDir: parsed.migrationsDir ?? null,
    };

    console.log(`✓ [@haexhub/sdk] Loaded ${resolvedManifestPath}`);
    return manifest;
  } catch (error) {
    console.warn(
      `[@haexhub/sdk] Warning: manifest.json not found at ${resolvedManifestPath}, extension info will not be available`
    );
    return null;
  }
}
