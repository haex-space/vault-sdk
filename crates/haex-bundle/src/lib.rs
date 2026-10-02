//! The extension bundle format `haextension-bundle/2`: the one implementation of reading,
//! writing, signing and verifying `.xt` archives.
//!
//! Hosts (holzi) use this crate natively; the `haex` tool of the vault-sdk uses its WebAssembly
//! build (feature `wasm`). The rules are described in `test-vectors/bundles/README.md`; the test
//! vectors there are generated independently of this crate by
//! `scripts/generate-bundle-vectors.mjs` and pin every error kind.

pub mod archive;
pub mod error;
pub mod format;
pub mod jcs;
pub mod sign;
pub mod verify;
#[cfg(feature = "wasm")]
mod wasm;

pub use archive::{read_archive, write_archive};
pub use error::{BundleError, ErrorKind, Result};
pub use sign::{sign_entries, signing_key_from_pkcs8, SignedFile};
pub use verify::{verify_entries, Migration, VerifiedBundle};

/// One file of a bundle: its path inside the archive and its exact bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    pub data: Vec<u8>,
}

/// Reads and verifies a `.xt` archive: every rule of the format, in the order of the contract.
pub fn verify_archive(bytes: &[u8]) -> Result<VerifiedBundle> {
    verify_entries(read_archive(bytes)?)
}

/// Signs `files` with `manifest`, writes the archive and verifies the result like a host would.
pub fn build_archive(
    files: Vec<Entry>,
    manifest: jcs::JsonValue,
    key: &ed25519_dalek::SigningKey,
) -> Result<Vec<u8>> {
    let archive = write_archive(&sign_entries(files, manifest, key)?);
    verify_archive(&archive)?;
    Ok(archive)
}
