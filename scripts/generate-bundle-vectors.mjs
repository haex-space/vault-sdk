#!/usr/bin/env node
/**
 * Generates the shared test vectors for the bundle format `haextension-bundle/2`
 * into `test-vectors/bundles/` (bundles, `README.md`, `expected.json`).
 *
 * This script deliberately uses only Node built-ins and none of `src/`: it is
 * an independent oracle for `haex sign` / `haex verify` and for every host that
 * verifies bundles. Bad vectors are signed correctly where possible, so that
 * exactly the one rule a vector targets is what rejects it.
 *
 * TEST-ONLY KEYS: both signing keys are derived from public seed strings below.
 * Their private halves are therefore public. They exist only to sign these
 * vectors and must never sign anything else.
 *
 * Usage: node scripts/generate-bundle-vectors.mjs
 */
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { deflateRawSync, crc32 } from "node:zlib";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test-vectors", "bundles");
const FORMAT = "haextension-bundle/2";
const MANIFEST = "haextension/manifest.json";
const SIGNATURE = "haextension/signature.json";
const MAX_RATIO = 200;

// ---------------------------------------------------------------------------
// Test-only keys
// ---------------------------------------------------------------------------

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const sha256 = (data) => createHash("sha256").update(data).digest();

function testKey(label) {
  const seedText = `haextension-bundle/2 test vectors only, never use for real signing: ${label}`;
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, sha256(Buffer.from(seedText, "utf8"))]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return { label, seedText, privateKey, publicKey: spki.subarray(-32).toString("hex") };
}

const KEY_A = testKey("A");
const KEY_B = testKey("B");

// ---------------------------------------------------------------------------
// Restricted JCS (ASCII keys, safe integers, no floats) — sorted keys, no spaces
// ---------------------------------------------------------------------------

function jcs(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`not a safe integer: ${value}`);
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Low-level zip writer (supports the malformations the bad vectors need)
// ---------------------------------------------------------------------------

const DOS_DATE_1980_01_01 = (0 << 9) | (1 << 5) | 1;
const UNIX_REGULAR_FILE = 0o100644;

/** Deflate when it saves space and keeps the ratio within the limit, otherwise store. */
function chooseMethod(data) {
  if (data.length === 0) return 0;
  const deflated = deflateRawSync(data, { level: 9 });
  return deflated.length < data.length && data.length <= deflated.length * MAX_RATIO ? 8 : 0;
}

/**
 * entries: { name: string, data: Buffer, method?: 0|8, mode?: number, declaredSize?: number }
 */
function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.method ?? chooseMethod(entry.data);
    const payload = method === 8 ? deflateRawSync(entry.data, { level: 9 }) : entry.data;
    const size = entry.declaredSize ?? entry.data.length;
    const crc = crc32(entry.data);
    const mode = entry.mode ?? UNIX_REGULAR_FILE;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((mode << 16) | (entry.name.endsWith("/") ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

// ---------------------------------------------------------------------------
// Bundle builder
// ---------------------------------------------------------------------------

const byPathBytes = (a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8"));
const file = (path, data) => ({ path, data: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8") });

/**
 * Builds a correctly signed v2 bundle, then lets `tamper` change the archive
 * entries after signing.
 *
 * files:        app files (without the two control files)
 * manifest:     object (written as JCS) or raw Buffer (written verbatim)
 * key:          signing key; its public key goes into signature.json
 * tamper:       (entries) => entries, applied to the zip entries after signing
 */
function buildBundle({ files, manifest, key = KEY_A, tamper = (entries) => entries }) {
  const manifestBytes = Buffer.isBuffer(manifest) ? manifest : Buffer.from(jcs(manifest), "utf8");
  const listed = [...files, file(MANIFEST, manifestBytes)].sort(byPathBytes);
  const body = {
    files: listed.map((f) => ({ path: f.path, sha256: sha256(f.data).toString("hex"), size: f.data.length })),
    format: FORMAT,
    publicKey: key.publicKey,
  };
  const message = Buffer.from(`${FORMAT}\n${jcs(body)}`, "utf8");
  const signature = sign(null, message, key.privateKey).toString("hex");
  const signatureFile = file(SIGNATURE, jcs({ ...body, signature }));
  const entries = [...listed, signatureFile].sort(byPathBytes).map((f) => ({ name: f.path, data: f.data }));
  return writeZip(tamper(entries));
}

const replaceEntry = (name, data) => (entries) =>
  entries.map((e) => (e.name === name ? { ...e, data: Buffer.from(data, "utf8") } : e));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_HTML = '<!doctype html>\n<html><head><meta charset="utf-8"><title>Minimal</title></head>' +
  "<body><p>minimal</p></body></html>\n";

const minimalManifest = (overrides = {}) => ({
  name: "minimal",
  version: "1.0.0",
  publicKey: KEY_A.publicKey,
  permissions: {},
  ...overrides,
});

const minimalFiles = () => [file("index.html", MINIMAL_HTML)];

/** Same as minimal, plus two scripts used by the tamper vectors. */
const scriptFiles = () => [
  ...minimalFiles(),
  file("assets/a.js", "export const a = 1;\nexport const b = 2;\n"),
  file("assets/b.js", "export const c = 3;\n"),
  file("assets/app.js", "import './a.js';\nimport './b.js';\n"),
];

function notesLike() {
  const table = (t) => `${KEY_A.publicKey}__notes-like__${t}`;
  const journal = {
    version: "7",
    dialect: "sqlite",
    entries: [
      { idx: 0, version: "6", when: 1727000000000, tag: "0000_init", breakpoints: true },
      { idx: 1, version: "6", when: 1727500000000, tag: "0001_tags", breakpoints: true },
    ],
  };
  const html = [
    "<!DOCTYPE html>",
    '<html lang="de"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Notes</title>",
    '<link rel="stylesheet" href="./_nuxt/entry.B7x2kQ9a.css" crossorigin>',
    '<link rel="modulepreload" as="script" crossorigin href="./_nuxt/Cq3f8Lw1.js">',
    '<script type="module" src="./_nuxt/Cq3f8Lw1.js" crossorigin></script>',
    "</head><body>",
    '<div id="__nuxt"></div><div id="teleports"></div>',
    '<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="false" id="__NUXT_DATA__">' +
      '[{"serverRendered":1},false]</script>',
    '<script>window.__NUXT__={};window.__NUXT__.config={public:{},app:{baseURL:"./",' +
      'buildId:"5c1d0e7a-2f4b-4d8e-9a61-3b7c9e0f1a2d",buildAssetsDir:"/_nuxt/",cdnURL:""}}</script>',
    "</body></html>",
    "",
  ].join("\n");
  const files = [
    file("index.html", html),
    file("200.html", html),
    file("404.html", html),
    file("favicon.ico", Buffer.from("AAABAAEAAQEAAAEAIAAwAAAAFgAAACgAAAABAAAAAgAAAAEAIAAAAAAA", "base64")),
    file("icon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>\n'),
    file("_nuxt/Cq3f8Lw1.js", "const e=document.getElementById('__nuxt');e.textContent='notes';\n".repeat(40)),
    file("_nuxt/entry.B7x2kQ9a.css", "body{margin:0;font-family:system-ui,sans-serif}\n"),
    file("_nuxt/builds/latest.json", '{"id":"5c1d0e7a-2f4b-4d8e-9a61-3b7c9e0f1a2d","timestamp":1727500000000}'),
    file("_nuxt/builds/meta/5c1d0e7a-2f4b-4d8e-9a61-3b7c9e0f1a2d.json",
      '{"id":"5c1d0e7a-2f4b-4d8e-9a61-3b7c9e0f1a2d","timestamp":1727500000000,"matcher":{},"prerendered":[]}'),
    // U+FF5E sorts before U+1F600 in UTF-8 bytes but after it in UTF-16 code units.
    file("locales/～.json", '{"wave":"～"}\n'),
    file("locales/\u{1F600}.json", '{"smile":"😀"}\n'),
    file("locales/übersicht.json", '{"title":"Übersicht"}\n'),
    file("database/migrations/0000_init.sql",
      `CREATE TABLE \`${table("notes")}\` (\n\t\`id\` text PRIMARY KEY NOT NULL,\n\t\`title\` text NOT NULL,\n` +
      `\t\`body\` text DEFAULT '' NOT NULL,\n\t\`updated_at\` integer NOT NULL\n);\n--> statement-breakpoint\n` +
      `CREATE INDEX \`${table("notes")}_updated_idx\` ON \`${table("notes")}\` (\`updated_at\`);`),
    file("database/migrations/0001_tags.sql",
      `CREATE TABLE \`${table("tags")}\` (\n\t\`note_id\` text NOT NULL,\n\t\`tag\` text NOT NULL,\n` +
      `\tPRIMARY KEY(\`note_id\`, \`tag\`)\n);`),
    file("database/migrations/meta/_journal.json", JSON.stringify(journal, null, 2)),
    file("database/migrations/meta/0000_snapshot.json", '{"version":"6","dialect":"sqlite","tables":{}}\n'),
    file("database/migrations/meta/0001_snapshot.json", '{"version":"6","dialect":"sqlite","tables":{}}\n'),
  ];
  const manifest = {
    name: "notes-like",
    displayName: "Notes",
    version: "1.2.0",
    author: "Test Author",
    entry: "index.html",
    icon: "icon.svg",
    publicKey: KEY_A.publicKey,
    permissions: { database: [], filesystem: [], http: [], shell: [] },
    homepage: null,
    description: "Nuxt-like build with inline scripts and Drizzle migrations",
    singleInstance: false,
    displayMode: "auto",
    migrationsDir: "database/migrations",
    i18n: { en: { name: "Notes", description: "Notes for tests" } },
  };
  return buildBundle({ files, manifest });
}

/** The pre-v2 layout produced by `haexhub sign` (SDK ≤ 3.x). */
function legacyBundle() {
  const sortKeys = (v) =>
    v === null || typeof v !== "object" || Array.isArray(v)
      ? v
      : Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  const manifest = sortKeys({ ...minimalManifest({ name: "legacy" }), signature: "" });
  const config = '{\n  "dev": {\n    "port": 5173\n  }\n}';
  const content = [
    file("haextension.config.json", config),
    file("haextension/public.key", KEY_A.publicKey),
    file(MANIFEST, JSON.stringify(manifest, null, 2)),
    ...minimalFiles(),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = sha256(Buffer.concat(content.map((f) => f.data)));
  manifest.signature = sign(null, hash, KEY_A.privateKey).toString("hex");
  const entries = [
    { name: "haextension/", data: Buffer.alloc(0), mode: 0o40755 },
    ...content.map((f) => ({
      name: f.path,
      data: f.path === MANIFEST ? Buffer.from(JSON.stringify(manifest, null, 2), "utf8") : f.data,
    })),
  ];
  return writeZip(entries);
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

const MiB = 1024 * 1024;
const zeros = (n) => Buffer.alloc(n);
const many = Array.from({ length: 1998 }, (_, i) => file(`f/${String(i).padStart(4, "0")}.txt`, `${i}\n`));

const VECTORS = [
  ["good-minimal", null, "index.html and manifest only", () =>
    buildBundle({ files: minimalFiles(), manifest: minimalManifest() })],
  ["good-notes-like", null, "Nuxt-like build: inline scripts, nested and non-ASCII paths, Drizzle migrations", notesLike],

  ["bad-moved-content", { kind: "file_mismatch", path: "assets/a.js" },
    "a line moved from assets/a.js to assets/b.js; concatenated content unchanged", () =>
      buildBundle({ files: scriptFiles(), manifest: minimalManifest(),
        tamper: (e) => replaceEntry("assets/b.js", "export const b = 2;\nexport const c = 3;\n")(
          replaceEntry("assets/a.js", "export const a = 1;\n")(e)) })],
  ["bad-renamed-file", { kind: "file_mismatch", path: "assets/app.js" },
    "assets/app.js renamed to assets/app2.js", () =>
      buildBundle({ files: scriptFiles(), manifest: minimalManifest(),
        tamper: (e) => e.map((x) => (x.name === "assets/app.js" ? { ...x, name: "assets/app2.js" } : x)) })],
  ["bad-extra-file", { kind: "file_mismatch", path: "assets/evil.js" },
    "unlisted assets/evil.js added", () =>
      buildBundle({ files: scriptFiles(), manifest: minimalManifest(),
        tamper: (e) => [...e, { name: "assets/evil.js", data: Buffer.from("alert(1);\n") }] })],
  ["bad-missing-file", { kind: "file_mismatch", path: "assets/b.js" },
    "listed assets/b.js removed", () =>
      buildBundle({ files: scriptFiles(), manifest: minimalManifest(),
        tamper: (e) => e.filter((x) => x.name !== "assets/b.js") })],
  ["bad-empty-file-added", { kind: "file_mismatch", path: "assets/empty.js" },
    "unlisted empty assets/empty.js added", () =>
      buildBundle({ files: scriptFiles(), manifest: minimalManifest(),
        tamper: (e) => [...e, { name: "assets/empty.js", data: Buffer.alloc(0) }] })],
  ["bad-duplicate-entry", { kind: "entry_duplicate" },
    "index.html appears twice in the central directory", () =>
      buildBundle({ files: minimalFiles(), manifest: minimalManifest(),
        tamper: (e) => [...e, { name: "index.html", data: Buffer.from("<script>alert(1)</script>") }] })],
  ["bad-case-collision", { kind: "entry_duplicate" },
    "index.html and Index.html (equal after NFC and lowercasing), both listed", () =>
      buildBundle({ files: [...minimalFiles(), file("Index.html", "<p>other</p>")], manifest: minimalManifest() })],
  ["bad-dotdot", { kind: "entry_path_invalid" }, "listed path assets/../../evil.js", () =>
    buildBundle({ files: [...minimalFiles(), file("assets/../../evil.js", "x")], manifest: minimalManifest() })],
  ["bad-absolute", { kind: "entry_path_invalid" }, "listed path /etc/evil.js", () =>
    buildBundle({ files: [...minimalFiles(), file("/etc/evil.js", "x")], manifest: minimalManifest() })],
  ["bad-backslash", { kind: "entry_path_invalid" }, "listed path assets\\evil.js", () =>
    buildBundle({ files: [...minimalFiles(), file("assets\\evil.js", "x")], manifest: minimalManifest() })],
  ["bad-symlink", { kind: "entry_kind" }, "listed entry docs/link with Unix symlink mode", () =>
    buildBundle({ files: [...minimalFiles(), file("docs/link", "../index.html")], manifest: minimalManifest(),
      tamper: (e) => e.map((x) => (x.name === "docs/link" ? { ...x, mode: 0o120777 } : x)) })],
  ["bad-not-nfc", { kind: "entry_path_invalid" }, "listed path cafe\\u0301.txt (NFD, not NFC)", () =>
    buildBundle({ files: [...minimalFiles(), file("café.txt", "x")], manifest: minimalManifest() })],
  ["bad-manifest-not-canonical", { kind: "manifest_not_canonical" },
    "manifest pretty-printed (listed and signed with these bytes)", () =>
      buildBundle({ files: minimalFiles(),
        manifest: Buffer.from(JSON.stringify(JSON.parse(jcs(minimalManifest())), null, 2), "utf8") })],
  ["bad-manifest-float", { kind: "manifest_not_canonical" },
    "manifest contains the number 1.5 (listed and signed with these bytes)", () =>
      buildBundle({ files: minimalFiles(),
        manifest: Buffer.from(jcs(minimalManifest({ priority: 7 })).replace('"priority":7', '"priority":1.5')) })],
  ["bad-manifest-invalid", { kind: "manifest_invalid" }, "manifest name Notes_App violates FR-004", () =>
    buildBundle({ files: minimalFiles(), manifest: minimalManifest({ name: "Notes_App" }) })],
  ["bad-key-mismatch", { kind: "public_key_mismatch" },
    "manifest.publicKey is test key B, signature.json is key A (validly signed by A)", () =>
      buildBundle({ files: minimalFiles(), manifest: minimalManifest({ publicKey: KEY_B.publicKey }) })],
  ["bad-signature", { kind: "signature_invalid" }, "last byte of the signature flipped", () =>
    buildBundle({ files: minimalFiles(), manifest: minimalManifest(),
      tamper: (e) => e.map((x) => {
        if (x.name !== SIGNATURE) return x;
        const text = x.data.toString("utf8");
        const flipped = text.replace(/"signature":"([0-9a-f]+)"/, (_, hex) =>
          `"signature":"${hex.slice(0, -1)}${hex.endsWith("0") ? "1" : "0"}"`);
        return { ...x, data: Buffer.from(flipped, "utf8") };
      }) })],
  ["bad-zip-bomb", { kind: "entry_too_large" }, "listed bomb.bin: 26 MiB of zeros (> 25 MiB), deflated", () =>
    buildBundle({ files: [...minimalFiles(), file("bomb.bin", zeros(26 * MiB))], manifest: minimalManifest(),
      tamper: (e) => e.map((x) => (x.name === "bomb.bin" ? { ...x, method: 8 } : x)) })],
  ["bad-entry-overflow", { kind: "entry_too_large" },
    "index.html declares 16 bytes uncompressed but inflates to more", () =>
      buildBundle({ files: minimalFiles(), manifest: minimalManifest(),
        tamper: (e) => e.map((x) => (x.name === "index.html" ? { ...x, method: 8, declaredSize: 16 } : x)) })],
  ["bad-ratio", { kind: "entry_ratio" }, "listed zeros.bin: 1 MiB of zeros deflated (ratio > 200:1)", () =>
    buildBundle({ files: [...minimalFiles(), file("zeros.bin", zeros(MiB))], manifest: minimalManifest(),
      tamper: (e) => e.map((x) => (x.name === "zeros.bin" ? { ...x, method: 8 } : x)) })],
  ["bad-too-many-entries", { kind: "archive_too_large" }, "2001 entries, all listed (limit 2000)", () =>
    buildBundle({ files: [...minimalFiles(), ...many], manifest: minimalManifest() })],
  ["bad-truncated", { kind: "archive_invalid" }, "good-minimal without its end-of-central-directory record", () =>
    buildBundle({ files: minimalFiles(), manifest: minimalManifest() }).subarray(0, -22)],
  ["bad-forbidden-private-key", { kind: "entry_path_invalid" },
    "listed haextension/private.key (placeholder content, no key)", () =>
      buildBundle({ files: [...minimalFiles(), file("haextension/private.key", "placeholder, not a key\n")],
        manifest: minimalManifest() })],
  ["legacy-format", { kind: "legacy_signature_format" },
    "pre-v2 layout: signature in manifest, no signature.json, config, public.key and a directory entry", legacyBundle],
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
for (const name of readdirSync(OUT_DIR)) {
  if (name.endsWith(".xt")) rmSync(join(OUT_DIR, name));
}

const expected = {};
const lines = [];
for (const [name, error, description, build] of VECTORS) {
  writeFileSync(join(OUT_DIR, `${name}.xt`), build());
  expected[`${name}.xt`] = error ? { valid: false, ...error } : { valid: true };
  const outcome = !error ? "valid" : error.path ? `\`${error.kind} { path: "${error.path}" }\`` : `\`${error.kind}\``;
  lines.push(`- \`${name}.xt\` — ${outcome} — ${description}`);
}
writeFileSync(join(OUT_DIR, "expected.json"), `${JSON.stringify(expected, null, 2)}\n`);

const readme = `# Test vectors: \`${FORMAT}\`

Generated by \`scripts/generate-bundle-vectors.mjs\` (\`pnpm vectors:bundles\`); do not edit by hand.
Format: \`contracts/bundle-format.md\` of holzi spec 017. \`expected.json\` holds the same outcomes for tests.

**Test-only keys.** Every vector is signed with test key A (key B appears only in \`bad-key-mismatch\`).
Both keys are derived from public seeds in the script, so their private halves are public:
never trust them and never sign anything else with them.

- Key A public key: \`${KEY_A.publicKey}\`
- Key B public key: \`${KEY_B.publicKey}\`
- Derivation: Ed25519 seed = SHA-256(UTF-8 seed text), seed text in \`testKey()\` of the script.

## Check order

The expected kind assumes this order; the first failing check wins.

1. Archive: file ≤ 64 MiB (\`archive_too_large\`); end record and central directory readable, no ZIP64,
   counts consistent (\`archive_invalid\`); ≤ 2000 entries (\`archive_too_large\`).
2. Legacy: no \`haextension/signature.json\` and \`haextension/manifest.json\` is JSON with a \`signature\`
   field → \`legacy_signature_format\`.
3. Per entry, in central-directory order: name is UTF-8 (\`entry_path_invalid\`); regular file only,
   no directory/symlink/encryption, method Stored or Deflate (\`entry_kind\`); path rules and forbidden
   files (\`entry_path_invalid\`); exact or NFC+lowercase duplicate (\`entry_duplicate\`); declared size
   ≤ 25 MiB (\`entry_too_large\`); declared total ≤ 64 MiB (\`archive_too_large\`); ratio ≤ 200:1
   (\`entry_ratio\`); data yields more bytes than declared (\`entry_too_large\`), fewer bytes, bad CRC or
   inconsistent local header (\`archive_invalid\`).
4. Control files: manifest present (\`manifest_invalid\`), canonical restricted JSON
   (\`manifest_not_canonical\`); \`signature.json\` present, canonical, well-formed (\`signature_invalid\`).
5. Files: entries (without \`signature.json\`) equal \`files\` by path, size and SHA-256; the first differing
   path in UTF-8 byte order is reported (\`file_mismatch { path }\`).
6. \`manifest.publicKey == signature.publicKey\` (\`public_key_mismatch\`); manifest valid, \`name\` per FR-004,
   valid Ed25519 public key, \`entry\` listed (\`manifest_invalid\`).
7. Ed25519 signature over \`"${FORMAT}\\n"\` + JCS(\`signature.json\` without \`signature\`), strict
   (\`signature_invalid\`).

## Vectors

${lines.join("\n")}
`;
writeFileSync(join(OUT_DIR, "README.md"), readme);
console.log(`wrote ${VECTORS.length} vectors to ${OUT_DIR}`);
