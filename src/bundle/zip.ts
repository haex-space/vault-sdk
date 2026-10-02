/**
 * Zip layer of the bundle format `haextension-bundle/2` (Node.js only).
 *
 * The writer is deterministic: fixed modification time, no directory entries,
 * no extra fields, UTF-8 names, Unix regular-file mode, entries in the given
 * order. The reader never extracts to disk; it enforces the archive rules
 * (steps 1–3 of the check order in `test-vectors/bundles/README.md`) on the
 * raw central-directory records, before any content is trusted.
 */

import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { BUNDLE_LIMITS, BundleError, MANIFEST_PATH, SIGNATURE_PATH, createPathChecker } from "./format";
import { isLegacyBundle } from "./verify";
import type { BundleEntry } from "./sign";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const DOS_DATE_1980_01_01 = (0 << 9) | (1 << 5) | 1;
const HOST_UNIX = 3;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;
const DOS_DIRECTORY = 0x10;

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/** Deflate only when it saves space and keeps the entry within the ratio limit. */
function compress(data: Uint8Array): { method: number; payload: Uint8Array } {
  if (data.length > 0) {
    const deflated = deflateRawSync(data, { level: 9 });
    if (deflated.length < data.length && data.length <= deflated.length * BUNDLE_LIMITS.ratio) {
      return { method: METHOD_DEFLATE, payload: deflated };
    }
  }
  return { method: METHOD_STORED, payload: data };
}

/** Writes `entries` in the given order as a deterministic zip archive. */
export function writeBundleArchive(entries: readonly BundleEntry[]): Buffer {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const { method, payload } = compress(entry.data);
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, payload);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(CENTRAL_HEADER, 0);
    record.writeUInt16LE((HOST_UNIX << 8) | 20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(FLAG_UTF8, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(0, 12);
    record.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(payload.length, 20);
    record.writeUInt32LE(entry.data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((UNIX_REGULAR_FILE | 0o644) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);

    offset += local.length + name.length + payload.length;
  }
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralDirectory, end]);
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

interface CentralRecord {
  nameBytes: Buffer;
  madeBy: number;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  externalAttributes: number;
  localOffset: number;
}

const invalid = (message: string, path?: string): never => {
  throw new BundleError("archive_invalid", message, path);
};

function readCentralDirectory(archive: Buffer): { records: CentralRecord[]; centralOffset: number } {
  let eocd = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 22 - 0xffff); i--) {
    if (archive.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY && i + 22 + archive.readUInt16LE(i + 20) === archive.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) invalid("end of central directory not found");

  const diskEntries = archive.readUInt16LE(eocd + 8);
  const totalEntries = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0 || diskEntries !== totalEntries) {
    invalid("multi-disk archives are not supported");
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    invalid("ZIP64 is not supported");
  }
  if (totalEntries > BUNDLE_LIMITS.entries) {
    throw new BundleError("archive_too_large", `${totalEntries} entries, at most ${BUNDLE_LIMITS.entries} allowed`);
  }
  const centralEnd = centralOffset + centralSize;
  if (centralEnd > eocd) invalid("central directory overlaps the end record");

  const records: CentralRecord[] = [];
  let pos = centralOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (pos + 46 > centralEnd || archive.readUInt32LE(pos) !== CENTRAL_HEADER) invalid("malformed central directory");
    const nameLength = archive.readUInt16LE(pos + 28);
    const recordEnd = pos + 46 + nameLength + archive.readUInt16LE(pos + 30) + archive.readUInt16LE(pos + 32);
    if (recordEnd > centralEnd) invalid("central directory record exceeds the directory");
    records.push({
      nameBytes: archive.subarray(pos + 46, pos + 46 + nameLength),
      madeBy: archive.readUInt16LE(pos + 4),
      flags: archive.readUInt16LE(pos + 8),
      method: archive.readUInt16LE(pos + 10),
      crc: archive.readUInt32LE(pos + 16),
      compressedSize: archive.readUInt32LE(pos + 20),
      size: archive.readUInt32LE(pos + 24),
      externalAttributes: archive.readUInt32LE(pos + 38),
      localOffset: archive.readUInt32LE(pos + 42),
    });
    pos = recordEnd;
  }
  if (pos !== centralEnd) invalid("entry count in the end record does not match the central directory");
  return { records, centralOffset };
}

/** Reads one entry's bytes, failing as soon as it yields more than it declares. */
function readEntryData(archive: Buffer, record: CentralRecord, centralOffset: number, path: string): Uint8Array {
  const at = record.localOffset;
  if (at + 30 > centralOffset || archive.readUInt32LE(at) !== LOCAL_HEADER) invalid("missing local header", path);
  const nameLength = archive.readUInt16LE(at + 26);
  const start = at + 30 + nameLength + archive.readUInt16LE(at + 28);
  if (!archive.subarray(at + 30, at + 30 + nameLength).equals(record.nameBytes)) {
    invalid("local header name differs from the central directory", path);
  }
  // A reader that trusts the local header must see the same entry as this one.
  const localFlags = archive.readUInt16LE(at + 6);
  const encryption = FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION;
  if (archive.readUInt16LE(at + 8) !== record.method || (localFlags & encryption) !== (record.flags & encryption)) {
    invalid("local header method or encryption differs from the central directory", path);
  }
  const sizesInLocalHeader = (localFlags & FLAG_DATA_DESCRIPTOR) === 0;
  if (
    sizesInLocalHeader &&
    (archive.readUInt32LE(at + 14) !== record.crc ||
      archive.readUInt32LE(at + 18) !== record.compressedSize ||
      archive.readUInt32LE(at + 22) !== record.size)
  ) {
    invalid("local header CRC-32 or sizes differ from the central directory", path);
  }
  if (start + record.compressedSize > centralOffset) invalid("entry data exceeds the archive", path);
  const raw = archive.subarray(start, start + record.compressedSize);

  let data: Uint8Array;
  if (record.method === METHOD_STORED) {
    data = raw;
  } else {
    try {
      data = inflateRawSync(raw, { maxOutputLength: record.size + 1 });
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
        throw new BundleError("entry_too_large", `${path} inflates to more than its declared size`, path, { cause: error });
      }
      throw new BundleError("archive_invalid", `${path} has corrupt deflate data`, path, { cause: error });
    }
  }
  if (data.length > record.size) throw new BundleError("entry_too_large", `${path} yields more than declared`, path);
  if (data.length < record.size) invalid(`${path} yields fewer bytes than declared`, path);
  if (crc32(data) !== record.crc) invalid(`${path} fails its CRC-32`, path);
  return data;
}

function entryKindViolation(record: CentralRecord, path: string): string | null {
  if (record.flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) return "encrypted entry";
  if (record.method !== METHOD_STORED && record.method !== METHOD_DEFLATE) return `compression method ${record.method}`;
  if (path.endsWith("/")) return "directory entry";
  if (record.madeBy >> 8 === HOST_UNIX) {
    const type = (record.externalAttributes >>> 16) & UNIX_FILE_TYPE_MASK;
    if (type !== 0 && type !== UNIX_REGULAR_FILE) return "not a regular file (symlink, directory or special file)";
  } else if (record.externalAttributes & DOS_DIRECTORY) {
    return "directory entry";
  }
  return null;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Reads and checks a `.xt` archive; returns its entries in central-directory order. */
export function readBundleArchive(archive: Buffer): BundleEntry[] {
  if (archive.length > BUNDLE_LIMITS.archiveBytes) {
    throw new BundleError("archive_too_large", `archive is larger than ${BUNDLE_LIMITS.archiveBytes} bytes`);
  }
  if (archive.length < 22) invalid("too short for a zip archive");
  const { records, centralOffset } = readCentralDirectory(archive);

  const named = (path: string) => records.find((r) => r.nameBytes.equals(Buffer.from(path, "utf8")));
  const manifestRecord = named(MANIFEST_PATH);
  if (!named(SIGNATURE_PATH) && manifestRecord && manifestRecord.size <= BUNDLE_LIMITS.entryBytes) {
    let manifestBytes: Uint8Array | undefined;
    try {
      manifestBytes = readEntryData(archive, manifestRecord, centralOffset, MANIFEST_PATH);
    } catch {
      manifestBytes = undefined; // the entry checks below report the actual defect
    }
    if (isLegacyBundle(manifestBytes, false)) {
      throw new BundleError("legacy_signature_format", "pre-v2 bundle: re-sign it with the current `haex` tool");
    }
  }

  const checkPath = createPathChecker();
  const entries: BundleEntry[] = [];
  let total = 0;
  for (const record of records) {
    let path: string;
    try {
      path = utf8Decoder.decode(record.nameBytes);
    } catch (error) {
      throw new BundleError("entry_path_invalid", "entry name is not valid UTF-8", undefined, { cause: error });
    }
    const kind = entryKindViolation(record, path);
    if (kind) throw new BundleError("entry_kind", `${JSON.stringify(path)}: ${kind}`, path);
    checkPath(path);
    if (record.size > BUNDLE_LIMITS.entryBytes) {
      throw new BundleError("entry_too_large", `${path} is larger than ${BUNDLE_LIMITS.entryBytes} bytes`, path);
    }
    total += record.size;
    if (total > BUNDLE_LIMITS.totalBytes) {
      throw new BundleError("archive_too_large", `content is larger than ${BUNDLE_LIMITS.totalBytes} bytes`, path);
    }
    if (record.size > record.compressedSize * BUNDLE_LIMITS.ratio) {
      throw new BundleError("entry_ratio", `${path} compresses more than ${BUNDLE_LIMITS.ratio}:1`, path);
    }
    if (record.method === METHOD_STORED && record.compressedSize !== record.size) {
      invalid(`${path}: stored entry with differing sizes`, path);
    }
    entries.push({ path, data: readEntryData(archive, record, centralOffset, path) });
  }
  return entries;
}
