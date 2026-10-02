import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { tmpdir } from "os";
import { ExtensionSigner } from "../signing";
import { readBundleArchive, writeBundleArchive } from "../../bundle/zip";
import { parseCanonicalJson } from "../../bundle/jcs";
import { MANIFEST_PATH, SIGNATURE_PATH } from "../../bundle/format";

describe("ExtensionSigner.generateKeypair", () => {
  it("keeps the key format: raw public key and PKCS#8 private key, hex", async () => {
    const keypair = await ExtensionSigner.generateKeypair();
    expect(keypair.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keypair.privateKey).toMatch(/^302e020100300506032b657004220420[0-9a-f]{64}$/);
  });

  it("generates a different keypair each time", async () => {
    const [a, b] = await Promise.all([ExtensionSigner.generateKeypair(), ExtensionSigner.generateKeypair()]);
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe("ExtensionSigner.packageExtension (format v2)", () => {
  let projectDir: string;
  let originalCwd: string;
  let keypair: { publicKey: string; privateKey: string };

  const write = async (relative: string, content: string) => {
    const full = path.join(projectDir, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  };
  const pack = (name = "out.xt") => ExtensionSigner.packageExtension("dist", keypair.privateKey, name);

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(tmpdir(), "haex-sign-"));
    originalCwd = process.cwd();
    process.chdir(projectDir);
    keypair = await ExtensionSigner.generateKeypair();
    await write("package.json", JSON.stringify({ name: "test-ext", version: "1.0.0" }));
    await write("haextension.config.json", JSON.stringify({ dev: { haextension_dir: "haextension" } }));
    await write(
      "haextension/manifest.json",
      JSON.stringify({ publicKey: keypair.publicKey, signature: "", displayName: "Test", migrationsDir: "db/migrations" }),
    );
    await write("haextension/public.key", keypair.publicKey);
    await write("haextension/private.key", keypair.privateKey);
    await write("haextension/icon.svg", "<svg/>");
    await write("dist/index.html", "<!doctype html><script>window.x=1</script>");
    await write("dist/assets/～.js", "a");
    await write("dist/assets/😀.js", "b");
    await write("app/db/migrations/0000_init.sql", "CREATE TABLE t (id TEXT PRIMARY KEY);");
    await write("app/db/migrations/meta/_journal.json", '{"entries":[]}');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("writes a bundle that verifies, without keys, config or directory entries", async () => {
    const result = await ExtensionSigner.verifyPackage(await pack());
    if (!result.valid) throw new Error(result.error);
    expect(result.files.map((f) => f.path)).toEqual([
      "assets/～.js",
      "assets/😀.js",
      "db/migrations/0000_init.sql",
      "db/migrations/meta/_journal.json",
      "haextension/icon.svg",
      MANIFEST_PATH,
      "index.html",
    ]);
    expect(result.manifest).toMatchObject({ name: "test-ext", displayName: "Test", publicKey: keypair.publicKey });
    expect(result.manifest).not.toHaveProperty("signature");
  });

  it("writes the control files as canonical JSON and is byte-for-byte reproducible", async () => {
    const first = await fs.readFile(await pack("a.xt"));
    const second = await fs.readFile(await pack("b.xt"));
    expect(first.equals(second)).toBe(true);
    const entries = readBundleArchive(first);
    for (const control of [MANIFEST_PATH, SIGNATURE_PATH]) {
      expect(() => parseCanonicalJson(entries.find((e) => e.path === control)!.data)).not.toThrow();
    }
    // Local header of the first entry: modification time and date fixed at 1980-01-01 00:00.
    expect(first.readUInt16LE(10)).toBe(0);
    expect(first.readUInt16LE(12)).toBe(0x21);
  });

  it("refuses to package a symlink", async () => {
    await fs.symlink("../package.json", path.join(projectDir, "dist/link"));
    await expect(pack()).rejects.toMatchObject({ kind: "entry_kind", path: "link" });
  });

  it("refuses a forbidden file in the build output", async () => {
    await write("dist/haextension.config.json", "{}");
    await expect(pack()).rejects.toMatchObject({ kind: "entry_path_invalid" });
  });

  it("refuses a manifest that is not restricted JSON", async () => {
    await write("haextension/manifest.json", JSON.stringify({ publicKey: keypair.publicKey, weight: 1.5 }));
    await expect(pack()).rejects.toMatchObject({ kind: "manifest_not_canonical" });
  });

  it.each(["db/migrations/", "./db/migrations"])("normalizes migrationsDir %s in the manifest and the paths", async (dir) => {
    await write("haextension/manifest.json", JSON.stringify({ publicKey: keypair.publicKey, migrationsDir: dir }));
    const result = await ExtensionSigner.verifyPackage(await pack());
    if (!result.valid) throw new Error(result.error);
    expect(result.manifest.migrationsDir).toBe("db/migrations");
    expect(result.files.map((f) => f.path)).toContain("db/migrations/0000_init.sql");
  });

  it("keeps the error kind and removes the file when the written bundle fails verification", async () => {
    await write("package.json", JSON.stringify({ name: "@scope/test-ext", version: "1.0.0" }));
    await expect(pack()).rejects.toMatchObject({ kind: "manifest_invalid" });
    await expect(fs.stat(path.join(projectDir, "out.xt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("detects a changed file after signing", async () => {
    const file = await pack();
    const entries = readBundleArchive(await fs.readFile(file)).map((e) =>
      e.path === "index.html" ? { ...e, data: new TextEncoder().encode("<p>changed</p>") } : e,
    );
    await fs.writeFile(file, writeBundleArchive(entries));
    expect(await ExtensionSigner.verifyPackage(file)).toMatchObject({
      valid: false,
      kind: "file_mismatch",
      path: "index.html",
    });
  });

  it("reports a missing file as an I/O error", async () => {
    expect(await ExtensionSigner.verifyPackage(path.join(projectDir, "missing.xt"))).toMatchObject({
      valid: false,
      kind: "io_error",
    });
  });
});
