import { describe, it, expect } from "vitest";
import {
  importEd25519PrivateKeyAsync,
  isStrictEd25519PublicKey,
  isStrictEd25519Signature,
  signEd25519Async,
  verifyEd25519StrictAsync,
} from "../ed25519";

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;

function encodeLittleEndian(value: bigint, length = 32): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  return out;
}

// Seed bytes 1..32: fixed, test-only.
const PKCS8 = new Uint8Array([
  ...[0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20],
  ...Array.from({ length: 32 }, (_, i) => i + 1),
]);

describe("strict Ed25519 public keys", () => {
  it("accepts a generated key", async () => {
    const { publicKey } = await importEd25519PrivateKeyAsync(PKCS8);
    expect(isStrictEd25519PublicKey(publicKey)).toBe(true);
  });

  it.each([
    ["the identity (order 1)", encodeLittleEndian(1n)],
    ["y = 0 (order 4)", encodeLittleEndian(0n)],
    ["y = p - 1 (order 2)", encodeLittleEndian(P - 1n)],
    ["a non-canonical y >= p", encodeLittleEndian(P + 1n)],
    ["a y with no matching x", encodeLittleEndian(2n)],
    ["a wrong length", new Uint8Array(31)],
  ])("rejects %s", (_label, key) => {
    expect(isStrictEd25519PublicKey(key)).toBe(false);
  });
});

describe("verifyEd25519StrictAsync", () => {
  const message = new TextEncoder().encode("haextension-bundle/2\n{}");

  it("verifies a valid signature and rejects a changed message", async () => {
    const { privateKey, publicKey } = await importEd25519PrivateKeyAsync(PKCS8);
    const signature = await signEd25519Async(privateKey, message);
    expect(await verifyEd25519StrictAsync(publicKey, signature, message)).toBe(true);
    expect(await verifyEd25519StrictAsync(publicKey, signature, new TextEncoder().encode("other"))).toBe(false);
  });

  it("rejects a signature whose S is not reduced", async () => {
    const { privateKey } = await importEd25519PrivateKeyAsync(PKCS8);
    const signature = await signEd25519Async(privateKey, message);
    let s = 0n;
    for (let i = 63; i >= 32; i--) s = (s << 8n) | BigInt(signature[i]!);
    const malleable = new Uint8Array(signature);
    malleable.set(encodeLittleEndian(s + L), 32);
    expect(isStrictEd25519Signature(malleable)).toBe(false);
  });

  it("rejects a small-order R", () => {
    const signature = new Uint8Array(64);
    signature.set(encodeLittleEndian(1n), 0);
    expect(isStrictEd25519Signature(signature)).toBe(false);
  });
});
