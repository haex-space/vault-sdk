# Changelog

## [4.1.0](https://github.com/haex-space/vault-sdk/compare/v4.0.0...v4.1.0) (2026-10-05)


### Features

* **mail:** pass the IMAP config to startWatchingAsync ([f1588cf](https://github.com/haex-space/vault-sdk/commit/f1588cf5458c619c2b43b73ed3e73541669ce31b))
* **mail:** pass the IMAP config to startWatchingAsync ([d616104](https://github.com/haex-space/vault-sdk/commit/d6161043a235b608b85802510b636e8f07863604))
* **shell:** acknowledge shell output so the host can apply backpressure ([599dbca](https://github.com/haex-space/vault-sdk/commit/599dbca9dabcbe80b8d90e986fbd1df8ce5e4e5a))
* **shell:** acknowledge shell output so the host can apply backpressure ([b4e32d2](https://github.com/haex-space/vault-sdk/commit/b4e32d2f763b8ec2d8e1c9b60d59017c6ab60ae4))


### Bug Fixes

* **shell:** stop acknowledging when a native window's host lacks the command ([93e3f6f](https://github.com/haex-space/vault-sdk/commit/93e3f6f537044e5ffcff5491b2708a912a05b332))

## [4.0.0](https://github.com/haex-space/vault-sdk/compare/v3.7.0...v4.0.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* **bundle:** the browser entry no longer exports the bundle format (`BUNDLE_FORMAT`, `BUNDLE_LIMITS`, `BundleError`, `canonicalizeJson`, `parseCanonicalJson`, `verifyBundleEntriesAsync`, ...). Use `verifyBundle` / `buildBundle` from `@haex-space/vault-sdk/node`. Building the SDK needs a Rust toolchain with the wasm32-unknown-unknown target and wasm-bindgen.
* **cli:** bundles signed by 3.x are rejected as legacy_signature_format and must be re-signed with `haex sign`. ExtensionManifest has no signature field. verifyExtensionSignature, sortObjectKeysRecursively and hexToBytes are replaced by verifyBundleEntriesAsync, canonicalizeJson and parseCanonicalJson; ExtensionSigner.hashDirectory and signExtension are removed. The CLI binary was already `haex`; scripts calling `haexhub` must use `haex`.

### Features

* **bundle:** one Rust implementation of the bundle format for the tool and hosts ([979074e](https://github.com/haex-space/vault-sdk/commit/979074e8e644242ad81fb4a567a9fcfcbeb2f259))
* **bundle:** pin manifest and migration rules with test vectors ([bfad438](https://github.com/haex-space/vault-sdk/commit/bfad4384e5a58006ce34c354c05b8d833a66b3fa))
* **client:** add client.tab.requestAttention ([5414640](https://github.com/haex-space/vault-sdk/commit/5414640116421e4ece718c617dae221ab1c18bec))
* **cli:** sign and verify bundles in format haextension-bundle/2 ([9a874d9](https://github.com/haex-space/vault-sdk/commit/9a874d9bfd84b117dc41d95923d1612735143596))
* **dialog:** confirm dialogs drawn by the host ([e2327bf](https://github.com/haex-space/vault-sdk/commit/e2327bf6933dc284ee69c294f7e72c66253ca187))


### Bug Fixes

* **bundle:** inflate entries over 64 KiB and require the writer's zip layout ([4426a78](https://github.com/haex-space/vault-sdk/commit/4426a788c19d6bdc283af9c8f51521e87299eefc))
* **bundle:** reject a local header that disagrees with the central directory ([ce17f9e](https://github.com/haex-space/vault-sdk/commit/ce17f9ebdb2db9f666471330907c6ef6659e629c))
* **client:** accept the handshake port only from window.parent ([c1cb3da](https://github.com/haex-space/vault-sdk/commit/c1cb3da85b67dc96ca7c1dc1cf20876e7b8b11f4))
* **cli:** normalize migrationsDir and keep the error kind of the self-check ([b90a281](https://github.com/haex-space/vault-sdk/commit/b90a28115b407821165b169477fe0a85c5016dfa))
* **cli:** ship the bundle module once and keep its error kinds typed ([ff011f1](https://github.com/haex-space/vault-sdk/commit/ff011f12a43f3442b76ca7b386bd076a55121577))
* **dialog:** wait for the user's answer without the request timeout ([47026b6](https://github.com/haex-space/vault-sdk/commit/47026b6aecd988f5ef247b67bca304767079b1fa))

## [3.7.0](https://github.com/haex-space/vault-sdk/compare/v3.6.0...v3.7.0) (2026-07-21)


### Features

* **spaces:** expose assignment author + space members to extensions ([93eb36e](https://github.com/haex-space/vault-sdk/commit/93eb36ec98d02806496bd2a3fe0b56447c272ef0))
* **spaces:** expose assignment author and space members to extensions ([7bba3f4](https://github.com/haex-space/vault-sdk/commit/7bba3f4fe4a4c16b5a69d38a6364a9b452e42bae))

## [3.6.0](https://github.com/haex-space/vault-sdk/compare/v3.5.1...v3.6.0) (2026-07-17)


### Features

* **mail:** add background new-mail watch API ([8f83d82](https://github.com/haex-space/vault-sdk/commit/8f83d82155241513a5b95e267708b9c923414ff8))
* **mail:** add background new-mail watch API ([044d8be](https://github.com/haex-space/vault-sdk/commit/044d8be8f502f50d62b42397e7c581674226b79e))

## [3.5.1](https://github.com/haex-space/vault-sdk/compare/v3.5.0...v3.5.1) (2026-07-16)


### Bug Fixes

* **deps:** silence TS6.0 baseUrl deprecation for typescript 6.0.3 bump ([4da0f67](https://github.com/haex-space/vault-sdk/commit/4da0f67daf3a993fa7b951b3ffbf8d635cd365d6))

## [3.5.0](https://github.com/haex-space/vault-sdk/compare/v3.4.0...v3.5.0) (2026-07-12)


### Features

* **mail:** add hasAttachments to MessageEnvelope ([#34](https://github.com/haex-space/vault-sdk/issues/34)) ([1c4e78e](https://github.com/haex-space/vault-sdk/commit/1c4e78e589dd3534391c8e0a69200c7a362fcf5f))

## [3.4.0](https://github.com/haex-space/vault-sdk/compare/v3.3.0...v3.4.0) (2026-07-12)


### Features

* **mail:** add MailAPI.fetchAttachmentAsync ([#26](https://github.com/haex-space/vault-sdk/issues/26)) ([b5f16d1](https://github.com/haex-space/vault-sdk/commit/b5f16d1ffc0f847f3d8c31d8529ad758f6a406a4))

## [3.3.0](https://github.com/haex-space/vault-sdk/compare/v3.2.6...v3.3.0) (2026-06-17)


### Features

* add generic notifications API (show/dismiss/onClick) ([93c9293](https://github.com/haex-space/vault-sdk/commit/93c92936c8239d2e383164d4148c61e48c3f0947))
* **permissions:** auto-retry requests after a permission prompt is resolved ([865a732](https://github.com/haex-space/vault-sdk/commit/865a7323d3f40c22aa2f3c309824982090c73997))


### Bug Fixes

* **web:** base64-encode string request bodies ([e70662f](https://github.com/haex-space/vault-sdk/commit/e70662f71b07be8c4581a059433fb8c59573ae56))
