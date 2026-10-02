/**
 * Canonical JSON (RFC 8785, JCS) for the restricted JSON of the bundle format
 * `haextension-bundle/2`: ASCII keys only, safe integers only (no floats, no
 * exponents), no duplicate keys, valid Unicode strings.
 *
 * Within this restriction JCS is plain: keys sorted (ASCII, so code-unit order
 * equals byte order), no whitespace, numbers as integers, strings escaped as
 * ECMAScript `JSON.stringify` does. Browser-compatible, no dependencies.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class RestrictedJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestrictedJsonError";
  }
}

const MAX_DEPTH = 64;
const NON_ASCII = /[\u0080-\uffff]/;
const LONE_SURROGATE = /\p{Cs}/u;
const LITERALS: ReadonlyArray<readonly [string, JsonValue]> = [["true", true], ["false", false], ["null", null]];
const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

function checkString(value: string, what: string): void {
  if (LONE_SURROGATE.test(value)) throw new RestrictedJsonError(`${what} contains a lone surrogate`);
}

function checkKey(key: string): void {
  if (NON_ASCII.test(key)) throw new RestrictedJsonError(`non-ASCII key ${JSON.stringify(key)}`);
}

/** Serializes `value` as restricted JCS. Throws `RestrictedJsonError` outside the restriction. */
export function canonicalizeJson(value: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) throw new RestrictedJsonError("nesting too deep");
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RestrictedJsonError(`number ${value} is not a safe integer`);
    return String(value);
  }
  if (typeof value === "string") {
    checkString(value, "string");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJson(item, depth + 1)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const members = keys.map((key) => {
      checkKey(key);
      if (record[key] === undefined) throw new RestrictedJsonError(`key ${key} is undefined`);
      return `${JSON.stringify(key)}:${canonicalizeJson(record[key], depth + 1)}`;
    });
    return `{${members.join(",")}}`;
  }
  throw new RestrictedJsonError(`unsupported value of type ${typeof value}`);
}

/** Strict parser for the restricted JSON; rejects floats, duplicate and non-ASCII keys. */
export function parseRestrictedJson(text: string): JsonValue {
  let pos = 0;

  const fail = (message: string): never => {
    throw new RestrictedJsonError(`${message} at offset ${pos}`);
  };
  const skipWhitespace = () => {
    while (pos < text.length && " \t\n\r".includes(text[pos]!)) pos++;
  };
  const expectLiteral = (literal: string) => {
    if (text.startsWith(literal, pos)) {
      pos += literal.length;
    } else {
      fail("invalid literal");
    }
  };

  const parseString = (): string => {
    pos++; // opening quote
    let out = "";
    for (;;) {
      if (pos >= text.length) fail("unterminated string");
      const ch = text[pos]!;
      const code = ch.charCodeAt(0);
      if (ch === '"') {
        pos++;
        break;
      }
      if (code < 0x20) fail("control character in string");
      if (ch !== "\\") {
        out += ch;
        pos++;
        continue;
      }
      const esc = text[pos + 1];
      if (esc !== undefined && esc in SIMPLE_ESCAPES) {
        out += SIMPLE_ESCAPES[esc];
        pos += 2;
      } else if (esc === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(pos + 2, pos + 6))) {
        out += String.fromCharCode(parseInt(text.slice(pos + 2, pos + 6), 16));
        pos += 6;
      } else {
        fail("invalid escape");
      }
    }
    checkString(out, "string");
    return out;
  };

  const parseNumber = (): number => {
    const match = /^-?(0|[1-9][0-9]*)/.exec(text.slice(pos, pos + 32));
    if (!match) return fail("invalid number");
    pos += match[0].length;
    const next = text[pos];
    if (next === "." || next === "e" || next === "E") fail("floating-point number");
    const value = Number(match[0]);
    if (!Number.isSafeInteger(value)) fail("integer outside the safe range");
    return value;
  };

  const parseValue = (depth: number): JsonValue => {
    if (depth > MAX_DEPTH) fail("nesting too deep");
    skipWhitespace();
    const ch = text[pos];
    if (ch === "{") {
      pos++;
      const obj = Object.create(null) as Record<string, JsonValue>;
      const seen = new Set<string>();
      skipWhitespace();
      if (text[pos] === "}") {
        pos++;
        return obj;
      }
      for (;;) {
        skipWhitespace();
        if (text[pos] !== '"') fail("expected key");
        const key = parseString();
        checkKey(key);
        if (seen.has(key)) fail(`duplicate key ${JSON.stringify(key)}`);
        seen.add(key);
        skipWhitespace();
        if (text[pos] !== ":") fail("expected ':'");
        pos++;
        obj[key] = parseValue(depth + 1);
        skipWhitespace();
        if (text[pos] === ",") {
          pos++;
        } else if (text[pos] === "}") {
          pos++;
          return obj;
        } else {
          fail("expected ',' or '}'");
        }
      }
    }
    if (ch === "[") {
      pos++;
      const arr: JsonValue[] = [];
      skipWhitespace();
      if (text[pos] === "]") {
        pos++;
        return arr;
      }
      for (;;) {
        arr.push(parseValue(depth + 1));
        skipWhitespace();
        if (text[pos] === ",") {
          pos++;
        } else if (text[pos] === "]") {
          pos++;
          return arr;
        } else {
          fail("expected ',' or ']'");
        }
      }
    }
    if (ch === '"') return parseString();
    for (const [literal, literalValue] of LITERALS) {
      if (ch === literal[0]) {
        expectLiteral(literal);
        return literalValue;
      }
    }
    return parseNumber();
  };

  const value = parseValue(0);
  skipWhitespace();
  if (pos !== text.length) fail("trailing data");
  return value;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const utf8Encoder = new TextEncoder();

/**
 * Parses `bytes` and returns the value only if `bytes` is exactly its restricted
 * JCS form; never re-canonicalizes silently.
 */
export function parseCanonicalJson(bytes: Uint8Array): JsonValue {
  let text: string;
  try {
    text = utf8Decoder.decode(bytes);
  } catch (error) {
    throw new RestrictedJsonError(`not valid UTF-8: ${String(error)}`);
  }
  const value = parseRestrictedJson(text);
  if (canonicalizeJson(value) !== text) throw new RestrictedJsonError("bytes are not in canonical form");
  return value;
}

/** UTF-8 bytes of the restricted JCS form of `value`. */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  return utf8Encoder.encode(canonicalizeJson(value));
}
