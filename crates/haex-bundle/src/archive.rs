//! The zip layer: a deterministic writer and a reader that enforces the archive rules (steps 1–3
//! of the check order) on the raw central-directory records before any content is trusted. It
//! never extracts to disk.
//!
//! An own reader rather than the `zip` crate: that crate collapses duplicate names, does not compare
//! local headers with the central directory and has its own error mapping, so the check order and
//! the error kinds would depend on it.

use std::io::Write;

use flate2::{write::DeflateEncoder, Compression, Decompress, FlushDecompress, Status};

use crate::error::{BundleError, ErrorKind, Result};
use crate::format::{limits, PathChecker, MANIFEST_PATH, SIGNATURE_PATH};
use crate::verify::is_legacy_manifest;
use crate::Entry;

const LOCAL_HEADER: u32 = 0x0403_4b50;
const CENTRAL_HEADER: u32 = 0x0201_4b50;
const END_OF_CENTRAL_DIRECTORY: u32 = 0x0605_4b50;
const FLAG_ENCRYPTED: u16 = 0x0001;
const FLAG_DATA_DESCRIPTOR: u16 = 0x0008;
const FLAG_STRONG_ENCRYPTION: u16 = 0x0040;
const FLAG_UTF8: u16 = 0x0800;
const ENCRYPTION: u16 = FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION;
const METHOD_STORED: u16 = 0;
const METHOD_DEFLATE: u16 = 8;
const DOS_DATE_1980_01_01: u16 = (1 << 5) | 1;
const HOST_UNIX: u16 = 3;
const UNIX_FILE_TYPE_MASK: u32 = 0o170_000;
const UNIX_REGULAR_FILE: u32 = 0o100_000;
const DOS_DIRECTORY: u32 = 0x10;

// ---------------------------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------------------------

/// Deflate only when it saves space and keeps the entry within the ratio limit.
fn compress(data: &[u8]) -> (u16, Vec<u8>) {
    if !data.is_empty() {
        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::best());
        let deflated = encoder
            .write_all(data)
            .and_then(|()| encoder.finish())
            .expect("deflating into memory cannot fail");
        if deflated.len() < data.len() && data.len() as u64 <= deflated.len() as u64 * limits::RATIO
        {
            return (METHOD_DEFLATE, deflated);
        }
    }
    (METHOD_STORED, data.to_vec())
}

fn u16_le(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn u32_le(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

/// Writes `entries` in the given order as a deterministic zip archive: fixed modification time,
/// no directory entries, no extra fields, UTF-8 names, Unix regular-file mode.
///
/// # Panics
/// If the archive does not fit the classic zip format (more than 65 535 entries or 4 GiB), which a
/// signed bundle never reaches.
pub fn write_archive(entries: &[Entry]) -> Vec<u8> {
    let count = u16::try_from(entries.len()).expect("too many entries for a zip archive");
    let size32 = |n: usize| u32::try_from(n).expect("bundle too large for a zip archive");
    let mut out = Vec::new();
    let mut central = Vec::new();
    for entry in entries {
        let name = entry.path.as_bytes();
        let (method, payload) = compress(&entry.data);
        let crc = crc32fast::hash(&entry.data);
        let offset = size32(out.len());

        u32_le(&mut out, LOCAL_HEADER);
        u16_le(&mut out, 20);
        u16_le(&mut out, FLAG_UTF8);
        u16_le(&mut out, method);
        u16_le(&mut out, 0);
        u16_le(&mut out, DOS_DATE_1980_01_01);
        u32_le(&mut out, crc);
        u32_le(&mut out, size32(payload.len()));
        u32_le(&mut out, size32(entry.data.len()));
        u16_le(&mut out, name.len() as u16);
        u16_le(&mut out, 0);
        out.extend_from_slice(name);
        out.extend_from_slice(&payload);

        u32_le(&mut central, CENTRAL_HEADER);
        u16_le(&mut central, (HOST_UNIX << 8) | 20);
        u16_le(&mut central, 20);
        u16_le(&mut central, FLAG_UTF8);
        u16_le(&mut central, method);
        u16_le(&mut central, 0);
        u16_le(&mut central, DOS_DATE_1980_01_01);
        u32_le(&mut central, crc);
        u32_le(&mut central, size32(payload.len()));
        u32_le(&mut central, size32(entry.data.len()));
        u16_le(&mut central, name.len() as u16);
        u16_le(&mut central, 0); // extra
        u16_le(&mut central, 0); // comment
        u16_le(&mut central, 0); // disk
        u16_le(&mut central, 0); // internal attributes
        u32_le(&mut central, (UNIX_REGULAR_FILE | 0o644) << 16);
        u32_le(&mut central, offset);
        central.extend_from_slice(name);
    }
    let central_offset = size32(out.len());
    let central_size = size32(central.len());
    out.extend_from_slice(&central);
    u32_le(&mut out, END_OF_CENTRAL_DIRECTORY);
    u16_le(&mut out, 0);
    u16_le(&mut out, 0);
    u16_le(&mut out, count);
    u16_le(&mut out, count);
    u32_le(&mut out, central_size);
    u32_le(&mut out, central_offset);
    u16_le(&mut out, 0);
    out
}

// ---------------------------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------------------------

struct CentralRecord<'a> {
    name: &'a [u8],
    extra_length: usize,
    made_by: u16,
    flags: u16,
    method: u16,
    crc: u32,
    compressed_size: u64,
    size: u64,
    external_attributes: u32,
    local_offset: usize,
}

fn invalid(message: impl Into<String>) -> BundleError {
    BundleError::new(ErrorKind::ArchiveInvalid, message)
}

fn invalid_at(message: impl Into<String>, path: &str) -> BundleError {
    BundleError::at(ErrorKind::ArchiveInvalid, message, path)
}

/// Bounds-checked little-endian reads; reading past the end is a malformed archive.
struct Bytes<'a>(&'a [u8]);

impl<'a> Bytes<'a> {
    fn slice(&self, at: usize, len: usize) -> Result<&'a [u8]> {
        at.checked_add(len)
            .and_then(|end| self.0.get(at..end))
            .ok_or_else(|| invalid("truncated archive"))
    }

    fn u16(&self, at: usize) -> Result<u16> {
        let b = self.slice(at, 2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn u32(&self, at: usize) -> Result<u32> {
        let b = self.slice(at, 4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
}

fn read_central_directory<'a>(archive: &Bytes<'a>) -> Result<(Vec<CentralRecord<'a>>, usize)> {
    // No archive comment: the end record is the last 22 bytes. A comment could hide a second end
    // record that other zip readers would pick.
    let eocd = archive.0.len() - 22;
    if archive.u32(eocd)? != END_OF_CENTRAL_DIRECTORY || archive.u16(eocd + 20)? != 0 {
        return Err(invalid(
            "end of central directory not found at the end of the archive (no archive comment allowed)",
        ));
    }

    let disk_entries = archive.u16(eocd + 8)?;
    let total_entries = archive.u16(eocd + 10)?;
    let central_size = archive.u32(eocd + 12)?;
    let central_offset = archive.u32(eocd + 16)?;
    if archive.u16(eocd + 4)? != 0 || archive.u16(eocd + 6)? != 0 || disk_entries != total_entries {
        return Err(invalid("multi-disk archives are not supported"));
    }
    if total_entries == 0xffff || central_size == 0xffff_ffff || central_offset == 0xffff_ffff {
        return Err(invalid("ZIP64 is not supported"));
    }
    if usize::from(total_entries) > limits::ENTRIES {
        return Err(BundleError::new(
            ErrorKind::ArchiveTooLarge,
            format!(
                "{total_entries} entries, at most {} allowed",
                limits::ENTRIES
            ),
        ));
    }
    let central_offset = central_offset as usize;
    // Offsets are untrusted u32 values; on wasm32 `usize` has no room above them.
    let central_end = central_offset
        .checked_add(central_size as usize)
        .filter(|end| *end <= eocd);
    let Some(central_end) = central_end else {
        return Err(invalid("central directory overlaps the end record"));
    };

    let mut records = Vec::with_capacity(usize::from(total_entries));
    let mut pos = central_offset;
    for _ in 0..total_entries {
        if pos + 46 > central_end || archive.u32(pos)? != CENTRAL_HEADER {
            return Err(invalid("malformed central directory"));
        }
        let name_length = archive.u16(pos + 28)? as usize;
        let extra_length = archive.u16(pos + 30)? as usize;
        let record_end = pos + 46 + name_length + extra_length + archive.u16(pos + 32)? as usize;
        if record_end > central_end {
            return Err(invalid("central directory record exceeds the directory"));
        }
        records.push(CentralRecord {
            name: archive.slice(pos + 46, name_length)?,
            extra_length,
            made_by: archive.u16(pos + 4)?,
            flags: archive.u16(pos + 8)?,
            method: archive.u16(pos + 10)?,
            crc: archive.u32(pos + 16)?,
            compressed_size: u64::from(archive.u32(pos + 20)?),
            size: u64::from(archive.u32(pos + 24)?),
            external_attributes: archive.u32(pos + 38)?,
            local_offset: archive.u32(pos + 42)? as usize,
        });
        pos = record_end;
    }
    if pos != central_end {
        return Err(invalid(
            "entry count in the end record does not match the central directory",
        ));
    }
    Ok((records, central_offset))
}

enum InflateError {
    TooLarge,
    Corrupt,
}

/// Raw inflate that stops as soon as the output exceeds `max` bytes and requires the deflate stream
/// to end exactly at the end of the entry data (no trailing bytes).
fn inflate(raw: &[u8], max: u64) -> std::result::Result<Vec<u8>, InflateError> {
    let limit = usize::try_from(max + 1).map_err(|_| InflateError::TooLarge)?;
    let mut decompress = Decompress::new(false);
    let mut out = Vec::new();
    loop {
        let room = (limit - out.len()).min(64 * 1024);
        out.reserve_exact(room);
        let (before_in, before_out) = (decompress.total_in(), out.len());
        let consumed = usize::try_from(before_in).map_err(|_| InflateError::Corrupt)?;
        // `Finish` would make miniz_oxide try to inflate in one call and fail for good when the
        // output does not fit the room; `None` streams across calls.
        let status = decompress
            .decompress_vec(&raw[consumed..], &mut out, FlushDecompress::None)
            .map_err(|_| InflateError::Corrupt)?;
        if out.len() as u64 > max {
            return Err(InflateError::TooLarge);
        }
        if status == Status::StreamEnd {
            return if decompress.total_in() == raw.len() as u64 {
                Ok(out)
            } else {
                Err(InflateError::Corrupt)
            };
        }
        if decompress.total_in() == before_in && out.len() == before_out {
            return Err(InflateError::Corrupt);
        }
    }
}

/// Reads one entry's bytes, failing as soon as it yields more than it declares.
fn read_entry_data(
    archive: &Bytes<'_>,
    record: &CentralRecord<'_>,
    central_offset: usize,
    path: &str,
) -> Result<Vec<u8>> {
    let at = record.local_offset;
    if at.checked_add(30).is_none_or(|end| end > central_offset) || archive.u32(at)? != LOCAL_HEADER
    {
        return Err(invalid_at("missing local header", path));
    }
    let name_length = archive.u16(at + 26)? as usize;
    let start = at + 30 + name_length + archive.u16(at + 28)? as usize;
    if archive.slice(at + 30, name_length)? != record.name {
        return Err(invalid_at(
            "local header name differs from the central directory",
            path,
        ));
    }
    // A reader that trusts the local header must see the same entry as this one.
    let local_flags = archive.u16(at + 6)?;
    if archive.u16(at + 8)? != record.method
        || (local_flags & ENCRYPTION) != (record.flags & ENCRYPTION)
    {
        return Err(invalid_at(
            "local header method or encryption differs from the central directory",
            path,
        ));
    }
    if local_flags & FLAG_DATA_DESCRIPTOR == 0
        && (archive.u32(at + 14)? != record.crc
            || u64::from(archive.u32(at + 18)?) != record.compressed_size
            || u64::from(archive.u32(at + 22)?) != record.size)
    {
        return Err(invalid_at(
            "local header CRC-32 or sizes differ from the central directory",
            path,
        ));
    }
    let compressed = record.compressed_size as usize;
    if start
        .checked_add(compressed)
        .is_none_or(|end| end > central_offset)
    {
        return Err(invalid_at("entry data exceeds the archive", path));
    }
    let raw = archive.slice(start, compressed)?;

    let data = if record.method == METHOD_STORED {
        raw.to_vec()
    } else {
        inflate(raw, record.size).map_err(|e| match e {
            InflateError::TooLarge => BundleError::at(
                ErrorKind::EntryTooLarge,
                format!("{path} inflates to more than its declared size"),
                path,
            ),
            InflateError::Corrupt => invalid_at(format!("{path} has corrupt deflate data"), path),
        })?
    };
    if data.len() as u64 > record.size {
        return Err(BundleError::at(
            ErrorKind::EntryTooLarge,
            format!("{path} yields more than declared"),
            path,
        ));
    }
    if (data.len() as u64) < record.size {
        return Err(invalid_at(
            format!("{path} yields fewer bytes than declared"),
            path,
        ));
    }
    if crc32fast::hash(&data) != record.crc {
        return Err(invalid_at(format!("{path} fails its CRC-32"), path));
    }
    Ok(data)
}

/// Layout rules on the central-directory record: the archive must have the layout the writer
/// produces, so every zip reader sees the same entries as this one. Entries lie back to back from
/// offset 0 in central-directory order (no gaps, prefixes or overlaps), without data descriptors or
/// extra fields, and a non-ASCII name carries the UTF-8 flag.
fn layout_violation(record: &CentralRecord<'_>, expected_offset: usize) -> Option<&'static str> {
    if record.local_offset != expected_offset {
        return Some("entry does not start right after the previous one");
    }
    if record.flags & FLAG_DATA_DESCRIPTOR != 0 {
        return Some("entry uses a data descriptor");
    }
    if record.extra_length != 0 {
        return Some("central directory record has extra fields");
    }
    if !record.name.is_ascii() && record.flags & FLAG_UTF8 == 0 {
        return Some("non-ASCII name without the UTF-8 flag");
    }
    None
}

/// The same rules on the local header, once [`read_entry_data`] found it. Returns where the next
/// entry has to start.
fn check_local_layout(
    archive: &Bytes<'_>,
    record: &CentralRecord<'_>,
    path: &str,
) -> Result<usize> {
    let at = record.local_offset;
    if archive.u16(at + 6)? & FLAG_DATA_DESCRIPTOR != 0 || archive.u16(at + 28)? != 0 {
        return Err(invalid_at(
            format!("{path}: local header has a data descriptor or extra fields"),
            path,
        ));
    }
    Ok(at + 30 + record.name.len() + record.compressed_size as usize)
}

fn entry_kind_violation(record: &CentralRecord<'_>, path: &str) -> Option<String> {
    if record.flags & ENCRYPTION != 0 {
        return Some("encrypted entry".into());
    }
    if record.method != METHOD_STORED && record.method != METHOD_DEFLATE {
        return Some(format!("compression method {}", record.method));
    }
    if path.ends_with('/') {
        return Some("directory entry".into());
    }
    if record.made_by >> 8 == HOST_UNIX {
        let file_type = (record.external_attributes >> 16) & UNIX_FILE_TYPE_MASK;
        if file_type != 0 && file_type != UNIX_REGULAR_FILE {
            return Some("not a regular file (symlink, directory or special file)".into());
        }
    } else if record.external_attributes & DOS_DIRECTORY != 0 {
        return Some("directory entry".into());
    }
    None
}

/// Reads and checks a `.xt` archive; returns its entries in central-directory order.
pub fn read_archive(bytes: &[u8]) -> Result<Vec<Entry>> {
    if bytes.len() as u64 > limits::ARCHIVE_BYTES {
        return Err(BundleError::new(
            ErrorKind::ArchiveTooLarge,
            format!("archive is larger than {} bytes", limits::ARCHIVE_BYTES),
        ));
    }
    if bytes.len() < 22 {
        return Err(invalid("too short for a zip archive"));
    }
    let archive = Bytes(bytes);
    let (records, central_offset) = read_central_directory(&archive)?;

    // The pre-v2 format is recognised before every entry rule: old bundles contain files and
    // directory entries that v2 forbids.
    let named = |path: &str| records.iter().find(|r| r.name == path.as_bytes());
    if named(SIGNATURE_PATH).is_none() {
        if let Some(manifest) = named(MANIFEST_PATH).filter(|r| r.size <= limits::ENTRY_BYTES) {
            // A defect of the manifest entry itself is reported by the entry checks below.
            let data = read_entry_data(&archive, manifest, central_offset, MANIFEST_PATH).ok();
            if data.is_some_and(|d| is_legacy_manifest(&d)) {
                return Err(BundleError::new(
                    ErrorKind::LegacySignatureFormat,
                    "pre-v2 bundle: re-sign it with the current `haex` tool",
                ));
            }
        }
    }

    let mut checker = PathChecker::default();
    let mut entries = Vec::with_capacity(records.len());
    let mut total: u64 = 0;
    let mut next_offset = 0;
    for record in &records {
        let path = std::str::from_utf8(record.name).map_err(|_| {
            BundleError::new(ErrorKind::EntryPathInvalid, "entry name is not valid UTF-8")
        })?;
        if let Some(kind) = entry_kind_violation(record, path) {
            return Err(BundleError::at(
                ErrorKind::EntryKind,
                format!("{path:?}: {kind}"),
                path,
            ));
        }
        checker.check(path)?;
        if record.size > limits::ENTRY_BYTES {
            return Err(BundleError::at(
                ErrorKind::EntryTooLarge,
                format!("{path} is larger than {} bytes", limits::ENTRY_BYTES),
                path,
            ));
        }
        total += record.size;
        if total > limits::TOTAL_BYTES {
            return Err(BundleError::at(
                ErrorKind::ArchiveTooLarge,
                format!("content is larger than {} bytes", limits::TOTAL_BYTES),
                path,
            ));
        }
        if record.size > record.compressed_size * limits::RATIO {
            return Err(BundleError::at(
                ErrorKind::EntryRatio,
                format!("{path} compresses more than {}:1", limits::RATIO),
                path,
            ));
        }
        if record.method == METHOD_STORED && record.compressed_size != record.size {
            return Err(invalid_at(
                format!("{path}: stored entry with differing sizes"),
                path,
            ));
        }
        if let Some(violation) = layout_violation(record, next_offset) {
            return Err(invalid_at(format!("{path}: {violation}"), path));
        }
        let data = read_entry_data(&archive, record, central_offset, path)?;
        next_offset = check_local_layout(&archive, record, path)?;
        entries.push(Entry {
            path: path.to_owned(),
            data,
        });
    }
    if next_offset != central_offset {
        return Err(invalid(
            "central directory does not start right after the last entry",
        ));
    }
    Ok(entries)
}
