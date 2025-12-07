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
   * Generiert ein Ed25519 Keypair
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
   * Berechnet SHA-256 Hash aller Dateien in einem Verzeichnis
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
   * Signiert eine Extension
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
      hash
    );

    return {
      signature: Buffer.from(signatureBuffer).toString("hex"),
      publicKey: publicKeyHex,
      hash: hash.toString("hex"),
    };
  }

  /**
   * Packt und signiert eine Extension
   */
  static async packageExtension(
    extensionPath: string,
    privateKeyHex: string,
    outputPath?: string
  ): Promise<string> {
    // === VORBEREITUNG ===
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

    // 1. Private Key importieren und Public Key ableiten
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

    // === SIGNIERUNGSPROZESS ===

    // 2. Manifest für die Hash-Berechnung vorbereiten
    //    (Public Key rein, Signatur als leeren Platzhalter)
    manifest.publicKey = publicKeyHex;
    manifest.signature = ""; // signature leeren um Hash zu berechnen

    const canonicalManifestForHashing =
      this.sortObjectKeysRecursively(manifest);

    // 3. Temporäres Verzeichnis mit der exakten Struktur des Archivs erstellen
    const { tmpdir } = await import("os");
    const tempDir = path.join(tmpdir(), `haex-signing-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    let contentHash: Buffer;
    try {
      // Kopiere extensionPath Dateien ins temp root
      const { execSync } = await import("child_process");
      execSync(`cp -r "${extensionPath}/"* "${tempDir}/"`, { stdio: "ignore" });

      // Kopiere haextension Verzeichnis (ohne private.key)
      const tempExtensionDir = path.join(tempDir, extensionDir);
      await fs.mkdir(tempExtensionDir, { recursive: true });

      // Kopiere nur public.key, nicht private.key
      const publicKeyPath = path.join(extensionDir, "public.key");
      if (fsSync.existsSync(publicKeyPath)) {
        await fs.copyFile(publicKeyPath, path.join(tempExtensionDir, "public.key"));
      }

      // Schreibe manifest.json mit leerer Signatur ins temp haextension Verzeichnis
      const tempManifestPath = path.join(tempExtensionDir, "manifest.json");
      await fs.writeFile(
        tempManifestPath,
        JSON.stringify(canonicalManifestForHashing, null, 2)
      );

      // Kopiere haextension.config.json wenn vorhanden
      const configPath = path.join(process.cwd(), "haextension.config.json");
      if (fsSync.existsSync(configPath)) {
        await fs.copyFile(configPath, path.join(tempDir, "haextension.config.json"));
      }

      // Kopiere Migrations-Verzeichnis wenn migrationsDir im Manifest angegeben ist
      if (manifest.migrationsDir) {
        const config = readHaextensionConfig(process.cwd());
        // Default: app/{migrationsDir} für Nuxt-Projekte
        const migrationsSourceDir = config?.build?.migrationsSourceDir || `app/${manifest.migrationsDir}`;
        const migrationsSourcePath = path.join(process.cwd(), migrationsSourceDir);

        if (fsSync.existsSync(migrationsSourcePath)) {
          const tempMigrationsPath = path.join(tempDir, manifest.migrationsDir);
          await fs.mkdir(path.dirname(tempMigrationsPath), { recursive: true });
          const { execSync } = await import("child_process");
          execSync(`cp -r "${migrationsSourcePath}" "${tempMigrationsPath}"`, { stdio: "ignore" });
          console.log(`✓ Migrations copied from ${migrationsSourceDir} to ${manifest.migrationsDir}`);
        } else {
          console.warn(`⚠ Migrations directory not found: ${migrationsSourcePath}`);
        }
      }

      // Hash über das komplette temp Verzeichnis berechnen
      contentHash = await this.hashDirectory(tempDir);
    } finally {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    // 4. Echte Signatur aus diesem Hash erstellen
    const signatureBuffer = await webcrypto.subtle.sign(
      "Ed25519",
      privateKey,
      contentHash
    );
    const signatureHex = Buffer.from(signatureBuffer).toString("hex");

    // 5. Finale manifest.json mit der echten Signatur erstellen
    manifest.signature = signatureHex;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // === VERPACKUNG & AUFRÄUMEN ===

    // 6. Das Verzeichnis zippen und haextension.config.json + haextension/ Ordner hinzufügen
    const finalOutputPath =
      outputPath || `${manifest.name}-${manifest.version}${EXTENSION_FILE_EXTENSION}`;
    const output = fsSync.createWriteStream(finalOutputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on("close", async () => {
        // Aufräumen: Die Original-Manifest-Datei wiederherstellen
        await fs.writeFile(manifestPath, originalManifestContent);
        console.log("content_hash:", contentHash);
        console.log(
          `✓ Extension packaged!!: ${finalOutputPath} (${archive.pointer()} bytes)`
        );
        resolve(finalOutputPath);
      });

      output.on("error", (err) => {
        // Bei Fehler ebenfalls aufräumen
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
   * Sortiert rekursiv die Schlüssel aller Objekte in einer Datenstruktur alphabetisch,
   * um einen kanonischen, deterministischen JSON-String zu erzeugen.
   */
  private static sortObjectKeysRecursively(obj: any): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeysRecursively(item));
    }

    return Object.keys(obj)
      .sort()
      .reduce((result, key) => {
        result[key] = this.sortObjectKeysRecursively(obj[key]);
        return result;
      }, {} as { [key: string]: any });
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
      privateKeyBuffer,
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
}
