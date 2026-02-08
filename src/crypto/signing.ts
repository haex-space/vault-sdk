// @haexhub/sdk/src/crypto/signing.ts
import { webcrypto } from "crypto";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import archiver from "archiver";
import { getExtensionDir, readHaextensionConfig } from "~/config";
import { readManifest } from "~/manifest";

export const EXTENSION_FILE_EXTENSION = ".xt";

export class ExtensionSigner {
  /**
   * Generates an Ed25519 keypair
   */
  static async generateKeypair(): Promise<{
    publicKey: string;
    privateKey: string;
  }> {
    const keypair = await webcrypto.subtle.generateKey(
      {
        name: "Ed25519",
        namedCurve: "Ed25519",
      },
      true,
      ["sign", "verify"]
    );

    const publicKeyBuffer = await webcrypto.subtle.exportKey(
      "raw",
      keypair.publicKey
    );
    const privateKeyBuffer = await webcrypto.subtle.exportKey(
      "pkcs8",
      keypair.privateKey
    );

    return {
      publicKey: Buffer.from(publicKeyBuffer).toString("hex"),
      privateKey: Buffer.from(privateKeyBuffer).toString("hex"),
    };
  }

  /**
   * Computes SHA-256 hash of all files in a directory
   */
  static async hashDirectory(dirPath: string): Promise<Buffer> {
    const files = await this.getAllFiles(dirPath);
    const sortedFiles = files.sort();

    console.log(`=== Files to hash (${sortedFiles.length}): ===`);
    for (const file of sortedFiles) {
      console.log(`  - ${path.relative(dirPath, file)}`);
    }

    const contents: Buffer[] = [];
    for (const file of sortedFiles) {
      const content = await fs.readFile(file);
      contents.push(content);
    }

    const combined = Buffer.concat(contents);
    const hashBuffer = await webcrypto.subtle.digest("SHA-256", combined);
    return Buffer.from(hashBuffer);
  }

  /**
   * Signs an extension
   */
  static async signExtension(
    extensionPath: string,
    privateKeyHex: string
  ): Promise<{ signature: string; publicKey: string; hash: string }> {
    const privateKeyBuffer = Buffer.from(privateKeyHex, "hex");
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      privateKeyBuffer,
      {
        name: "Ed25519",
        namedCurve: "Ed25519",
      },
      true,
      ["sign"]
    );

    const publicKeyBuffer = await this.derivePublicKey(privateKeyBuffer);
    const publicKeyHex = Buffer.from(publicKeyBuffer).toString("hex");

    const hash = await this.hashDirectory(extensionPath);

    const signatureBuffer = await webcrypto.subtle.sign(
      "Ed25519",
      privateKey,
      new Uint8Array(hash)
    );

    return {
      signature: Buffer.from(signatureBuffer).toString("hex"),
      publicKey: publicKeyHex,
      hash: hash.toString("hex"),
    };
  }

  /**
   * Packages and signs an extension
   */
  static async packageExtension(
    extensionPath: string,
    privateKeyHex: string,
    outputPath?: string
  ): Promise<string> {
    // === PREPARATION ===
    // Read manifest from haextension/ folder (using config)
    const extensionDir = getExtensionDir();
    const manifestPath = path.join(extensionDir, "manifest.json");
    const originalManifestContent = await fs.readFile(manifestPath, "utf-8");

    // Read manifest with version fallback to package.json
    const manifestObject = readManifest({
      rootDir: process.cwd(),
      extensionDir,
    });

    if (!manifestObject) {
      throw new Error("Failed to read manifest.json");
    }

    const manifest = { ...manifestObject };

    // 1. Import private key and derive public key
    const privateKeyBuffer = Buffer.from(privateKeyHex, "hex");
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      privateKeyBuffer,
      { name: "Ed25519", namedCurve: "Ed25519" },
      true,
      ["sign"]
    );
    const publicKeyBuffer = await this.derivePublicKey(privateKeyBuffer);
    const publicKeyHex = Buffer.from(publicKeyBuffer).toString("hex");

    // === SIGNING PROCESS ===

    // 2. Prepare manifest for hash calculation
    //    (add public key, set signature as empty placeholder)
    manifest.publicKey = publicKeyHex;
    manifest.signature = ""; // clear signature to compute hash

    const canonicalManifestForHashing =
      this.sortObjectKeysRecursively(manifest);

    // 3. Create temporary directory with exact archive structure
    const { tmpdir } = await import("os");
    const tempDir = path.join(tmpdir(), `haex-signing-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    let contentHash: Buffer;
    try {
      // Copy extensionPath files to temp root
      await fs.cp(extensionPath, tempDir, { recursive: true });

      // Copy haextension directory (excluding private.key)
      const tempExtensionDir = path.join(tempDir, extensionDir);
      await fs.mkdir(tempExtensionDir, { recursive: true });

      // Copy all files from haextension/ except private.key
      // (manifest.json will be overwritten with empty signature afterwards)
      await this.copyDirectory(extensionDir, tempExtensionDir, ['private.key']);

      // Write manifest.json with empty signature to temp haextension directory
      // (overwrites the previously copied version)
      const tempManifestPath = path.join(tempExtensionDir, "manifest.json");
      await fs.writeFile(
        tempManifestPath,
        JSON.stringify(canonicalManifestForHashing, null, 2)
      );

      // Copy haextension.config.json if it exists
      const configPath = path.join(process.cwd(), "haextension.config.json");
      if (fsSync.existsSync(configPath)) {
        await fs.copyFile(configPath, path.join(tempDir, "haextension.config.json"));
      }

      // Copy migrations directory if migrationsDir is specified in manifest
      if (manifest.migrationsDir) {
        const config = readHaextensionConfig(process.cwd());
        // Default: app/{migrationsDir} for Nuxt projects
        const migrationsSourceDir = config?.build?.migrationsSourceDir || `app/${manifest.migrationsDir}`;
        const migrationsSourcePath = path.join(process.cwd(), migrationsSourceDir);

        if (fsSync.existsSync(migrationsSourcePath)) {
          const tempMigrationsPath = path.join(tempDir, manifest.migrationsDir);
          await fs.mkdir(path.dirname(tempMigrationsPath), { recursive: true });
          await fs.cp(migrationsSourcePath, tempMigrationsPath, { recursive: true });
          console.log(`✓ Migrations copied from ${migrationsSourceDir} to ${manifest.migrationsDir}`);
        } else {
          console.warn(`⚠ Migrations directory not found: ${migrationsSourcePath}`);
        }
      }

      // Compute hash over the complete temp directory
      contentHash = await this.hashDirectory(tempDir);
    } finally {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    // 4. Create actual signature from this hash
    const signatureBuffer = await webcrypto.subtle.sign(
      "Ed25519",
      privateKey,
      new Uint8Array(contentHash)
    );
    const signatureHex = Buffer.from(signatureBuffer).toString("hex");

    // 5. Create final manifest.json with the actual signature
    manifest.signature = signatureHex;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // === PACKAGING & CLEANUP ===

    // 6. Zip the directory and add haextension.config.json + haextension/ folder
    const finalOutputPath =
      outputPath || `${manifest.name}-${manifest.version}${EXTENSION_FILE_EXTENSION}`;
    const output = fsSync.createWriteStream(finalOutputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on("close", async () => {
        // Cleanup: Restore the original manifest file
        await fs.writeFile(manifestPath, originalManifestContent);
        console.log("content_hash:", contentHash);
        console.log(
          `✓ Extension packaged: ${finalOutputPath} (${archive.pointer()} bytes)`
        );

        // Verify the signature of the created package
        console.log("\n🔍 Verifying signature...");
        const verifyResult = await this.verifyPackage(finalOutputPath);
        if (!verifyResult.valid) {
          console.error(`❌ Signature verification failed: ${verifyResult.error}`);
          reject(new Error(`Signature verification failed: ${verifyResult.error}`));
          return;
        }
        console.log("✓ Signature verified successfully!");

        resolve(finalOutputPath);
      });

      output.on("error", (err) => {
        // Also cleanup on error
        fs.writeFile(manifestPath, originalManifestContent).finally(() =>
          reject(err)
        );
      });
      archive.on("error", reject);

      archive.pipe(output);

      // Add extension files
      archive.directory(extensionPath, false);

      // Add haextension directory with manifest (excluding private.key)
      archive.glob("**/*", {
        cwd: extensionDir,
        ignore: ["private.key"],
        dot: false
      }, { prefix: extensionDir });

      // Add haextension.config.json if it exists
      const configPath = path.join(process.cwd(), "haextension.config.json");
      if (fsSync.existsSync(configPath)) {
        archive.file(configPath, { name: "haextension.config.json" });
      }

      // Add migrations directory if migrationsDir is specified in manifest
      if (manifest.migrationsDir) {
        const config = readHaextensionConfig(process.cwd());
        const migrationsSourceDir = config?.build?.migrationsSourceDir || `app/${manifest.migrationsDir}`;
        const migrationsSourcePath = path.join(process.cwd(), migrationsSourceDir);

        if (fsSync.existsSync(migrationsSourcePath)) {
          archive.directory(migrationsSourcePath, manifest.migrationsDir);
          console.log(`✓ Adding migrations to bundle: ${manifest.migrationsDir}`);
        }
      }

      archive.finalize();
    });
  }

  // Helper Methods

  /**
   * Recursively sorts all object keys in a data structure alphabetically
   * to produce a canonical, deterministic JSON string.
   */
  private static sortObjectKeysRecursively(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeysRecursively(item));
    }

    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce((result, key) => {
        result[key] = this.sortObjectKeysRecursively((obj as Record<string, unknown>)[key]);
        return result;
      }, {} as Record<string, unknown>);
  }

  /**
   * Recursively copies a directory, excluding specified files
   */
  private static async copyDirectory(
    src: string,
    dest: string,
    excludeFiles: string[] = []
  ): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeFiles.includes(entry.name)) continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath, excludeFiles);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private static async getAllFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return this.getAllFiles(fullPath);
        }
        return [fullPath];
      })
    );
    return files.flat();
  }

  private static async derivePublicKey(
    privateKeyBuffer: Buffer
  ): Promise<Uint8Array> {
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      new Uint8Array(privateKeyBuffer),
      { name: "Ed25519", namedCurve: "Ed25519" },
      true,
      ["sign"]
    );

    const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
    const publicKeyJwk = { ...jwk, d: undefined, key_ops: ["verify"] };

    const publicKey = await webcrypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "Ed25519", namedCurve: "Ed25519" },
      true,
      ["verify"]
    );

    return new Uint8Array(await webcrypto.subtle.exportKey("raw", publicKey));
  }

  /**
   * Verifies the signature of a packaged extension (.xt file)
   */
  static async verifyPackage(packagePath: string): Promise<{ valid: boolean; error?: string }> {
    const JSZip = (await import("jszip")).default;

    try {
      const zipBuffer = await fs.readFile(packagePath);
      const zip = await JSZip.loadAsync(zipBuffer);

      // Read manifest
      const manifestFile = zip.file("haextension/manifest.json");
      if (!manifestFile) {
        return { valid: false, error: "manifest.json not found in package" };
      }
      const manifestContent = await manifestFile.async("string");
      const manifest = JSON.parse(manifestContent);

      const { publicKey: publicKeyHex, signature: signatureHex } = manifest;

      if (!publicKeyHex || !signatureHex) {
        return { valid: false, error: "Missing publicKey or signature in manifest" };
      }

      // Collect all files from ZIP
      const files: { path: string; content: Uint8Array }[] = [];
      for (const filePath of Object.keys(zip.files)) {
        const entry = zip.files[filePath];
        if (entry && !entry.dir) {
          const content = await entry.async("uint8array");
          files.push({ path: filePath, content });
        }
      }

      // Prepare manifest for hashing (with empty signature)
      const manifestForHashing = this.sortObjectKeysRecursively({
        ...manifest,
        signature: "",
      });
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifestForHashing, null, 2));

      // Replace manifest content with canonical version
      const filesForHashing = files.map(file => {
        if (file.path === "haextension/manifest.json") {
          return { path: file.path, content: manifestBytes };
        }
        return file;
      });

      // Sort files alphabetically (byte-order, same as hashDirectory uses .sort())
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
      const hashBuffer = await webcrypto.subtle.digest("SHA-256", combined);

      // Import public key
      const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");
      const publicKey = await webcrypto.subtle.importKey(
        "raw",
        publicKeyBuffer,
        { name: "Ed25519", namedCurve: "Ed25519" },
        false,
        ["verify"]
      );

      // Verify signature
      const signatureBuffer = Buffer.from(signatureHex, "hex");
      const isValid = await webcrypto.subtle.verify(
        "Ed25519",
        publicKey,
        signatureBuffer,
        hashBuffer
      );

      return { valid: isValid, error: isValid ? undefined : "Signature does not match" };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}
