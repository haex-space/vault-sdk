//! Canonical JSON (RFC 8785, JCS) for the restricted JSON of the bundle format: ASCII keys only,
//! integers within ±(2^53 − 1) only (no fractions, no exponents), no duplicate keys.
//!
//! Within this restriction JCS is plain: keys sorted (ASCII, so byte order), no whitespace,
//! integers in decimal, strings escaped as ECMAScript `JSON.stringify` does.

use std::collections::BTreeMap;

/// A value of the restricted JSON. Objects keep their keys sorted, which is the canonical order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Int(i64),
    String(String),
    Array(Vec<JsonValue>),
    Object(BTreeMap<String, JsonValue>),
}

/// Largest integer that JavaScript represents exactly (`Number.MAX_SAFE_INTEGER`).
pub const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;
const MAX_DEPTH: usize = 64;

impl JsonValue {
    pub fn as_object(&self) -> Option<&BTreeMap<String, JsonValue>> {
        match self {
            Self::Object(map) => Some(map),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_int(&self) -> Option<i64> {
        match self {
            Self::Int(n) => Some(*n),
            _ => None,
        }
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }
}

impl From<&JsonValue> for serde_json::Value {
    fn from(value: &JsonValue) -> Self {
        match value {
            JsonValue::Null => Self::Null,
            JsonValue::Bool(b) => Self::Bool(*b),
            JsonValue::Int(n) => Self::from(*n),
            JsonValue::String(s) => Self::String(s.clone()),
            JsonValue::Array(items) => Self::Array(items.iter().map(Self::from).collect()),
            JsonValue::Object(map) => Self::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), Self::from(v)))
                    .collect(),
            ),
        }
    }
}

/// Serializes `value` in its canonical form. Every [`JsonValue`] is within the restriction except
/// integers beyond [`MAX_SAFE_INTEGER`] and non-ASCII keys, which return an error.
pub fn canonicalize(value: &JsonValue) -> Result<String, String> {
    let mut out = String::new();
    write_value(value, 0, &mut out)?;
    Ok(out)
}

/// UTF-8 bytes of the canonical form of `value`.
pub fn canonical_bytes(value: &JsonValue) -> Result<Vec<u8>, String> {
    canonicalize(value).map(String::into_bytes)
}

fn write_value(value: &JsonValue, depth: usize, out: &mut String) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err("nesting too deep".into());
    }
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        JsonValue::Int(n) => {
            if n.unsigned_abs() > MAX_SAFE_INTEGER as u64 {
                return Err(format!("number {n} is not a safe integer"));
            }
            out.push_str(&n.to_string());
        }
        JsonValue::String(s) => write_string(s, out),
        JsonValue::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(item, depth + 1, out)?;
            }
            out.push(']');
        }
        JsonValue::Object(map) => {
            out.push('{');
            for (i, (key, item)) in map.iter().enumerate() {
                if !key.is_ascii() {
                    return Err(format!("non-ASCII key {key:?}"));
                }
                if i > 0 {
                    out.push(',');
                }
                write_string(key, out);
                out.push(':');
                write_value(item, depth + 1, out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

/// Escapes like ECMAScript `JSON.stringify`: the short escapes, other control characters as
/// `\u00xx`, everything else literally.
fn write_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Parses restricted JSON. Rejects fractions, exponents, unsafe integers, duplicate and non-ASCII
/// keys, lone surrogates and trailing data.
pub fn parse_restricted(text: &str) -> Result<JsonValue, String> {
    let mut parser = Parser {
        bytes: text.as_bytes(),
        text,
        pos: 0,
    };
    let value = parser.value(0)?;
    parser.skip_whitespace();
    if parser.pos != parser.bytes.len() {
        return Err(parser.fail("trailing data"));
    }
    Ok(value)
}

/// Parses `bytes` and returns the value only if `bytes` is exactly its canonical form; never
/// re-canonicalizes silently.
pub fn parse_canonical(bytes: &[u8]) -> Result<JsonValue, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| format!("not valid UTF-8: {e}"))?;
    let value = parse_restricted(text)?;
    if canonicalize(&value)? != text {
        return Err("bytes are not in canonical form".into());
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    text: &'a str,
    pos: usize,
}

impl Parser<'_> {
    fn fail(&self, message: &str) -> String {
        format!("{message} at offset {}", self.pos)
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.pos += 1;
        }
    }

    fn value(&mut self, depth: usize) -> Result<JsonValue, String> {
        if depth > MAX_DEPTH {
            return Err(self.fail("nesting too deep"));
        }
        self.skip_whitespace();
        match self.peek() {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => self.string().map(JsonValue::String),
            Some(b't') => self.literal("true", JsonValue::Bool(true)),
            Some(b'f') => self.literal("false", JsonValue::Bool(false)),
            Some(b'n') => self.literal("null", JsonValue::Null),
            _ => self.number(),
        }
    }

    fn literal(&mut self, literal: &str, value: JsonValue) -> Result<JsonValue, String> {
        if self.bytes[self.pos..].starts_with(literal.as_bytes()) {
            self.pos += literal.len();
            Ok(value)
        } else {
            Err(self.fail("invalid literal"))
        }
    }

    fn object(&mut self, depth: usize) -> Result<JsonValue, String> {
        self.pos += 1;
        let mut map = BTreeMap::new();
        self.skip_whitespace();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(JsonValue::Object(map));
        }
        loop {
            self.skip_whitespace();
            if self.peek() != Some(b'"') {
                return Err(self.fail("expected key"));
            }
            let key = self.string()?;
            if !key.is_ascii() {
                return Err(self.fail(&format!("non-ASCII key {key:?}")));
            }
            if map.contains_key(&key) {
                return Err(self.fail(&format!("duplicate key {key:?}")));
            }
            self.skip_whitespace();
            if self.peek() != Some(b':') {
                return Err(self.fail("expected ':'"));
            }
            self.pos += 1;
            let item = self.value(depth + 1)?;
            map.insert(key, item);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(JsonValue::Object(map));
                }
                _ => return Err(self.fail("expected ',' or '}'")),
            }
        }
    }

    fn array(&mut self, depth: usize) -> Result<JsonValue, String> {
        self.pos += 1;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(JsonValue::Array(items));
        }
        loop {
            items.push(self.value(depth + 1)?);
            self.skip_whitespace();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(JsonValue::Array(items));
                }
                _ => return Err(self.fail("expected ',' or ']'")),
            }
        }
    }

    fn hex4(&self, at: usize) -> Option<u32> {
        let digits = self.text.get(at..at + 4)?;
        if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        u32::from_str_radix(digits, 16).ok()
    }

    fn string(&mut self) -> Result<String, String> {
        self.pos += 1;
        let mut out = String::new();
        loop {
            let Some(byte) = self.peek() else {
                return Err(self.fail("unterminated string"));
            };
            match byte {
                b'"' => {
                    self.pos += 1;
                    return Ok(out);
                }
                0..=0x1f => return Err(self.fail("control character in string")),
                b'\\' => {
                    let escape = self.bytes.get(self.pos + 1).copied();
                    let simple = match escape {
                        Some(b'"') => Some('"'),
                        Some(b'\\') => Some('\\'),
                        Some(b'/') => Some('/'),
                        Some(b'b') => Some('\u{8}'),
                        Some(b'f') => Some('\u{c}'),
                        Some(b'n') => Some('\n'),
                        Some(b'r') => Some('\r'),
                        Some(b't') => Some('\t'),
                        _ => None,
                    };
                    if let Some(c) = simple {
                        out.push(c);
                        self.pos += 2;
                    } else if escape == Some(b'u') {
                        out.push(self.unicode_escape()?);
                    } else {
                        return Err(self.fail("invalid escape"));
                    }
                }
                _ => {
                    let c = self.text[self.pos..]
                        .chars()
                        .next()
                        .expect("pos is on a char boundary");
                    out.push(c);
                    self.pos += c.len_utf8();
                }
            }
        }
    }

    /// `\uXXXX` at `pos`, a surrogate pair as two escapes; a lone surrogate is an error.
    fn unicode_escape(&mut self) -> Result<char, String> {
        let unit = self
            .hex4(self.pos + 2)
            .ok_or_else(|| self.fail("invalid escape"))?;
        self.pos += 6;
        let code = match unit {
            0xd800..=0xdbff => {
                let low = (self.bytes[self.pos..].starts_with(b"\\u"))
                    .then(|| self.hex4(self.pos + 2))
                    .flatten()
                    .filter(|low| (0xdc00..=0xdfff).contains(low))
                    .ok_or_else(|| self.fail("string contains a lone surrogate"))?;
                self.pos += 6;
                0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00)
            }
            0xdc00..=0xdfff => return Err(self.fail("string contains a lone surrogate")),
            unit => unit,
        };
        char::from_u32(code).ok_or_else(|| self.fail("invalid escape"))
    }

    fn number(&mut self) -> Result<JsonValue, String> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        match self.peek() {
            Some(b'0') => self.pos += 1,
            Some(b'1'..=b'9') => {
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.pos += 1;
                }
            }
            _ => return Err(self.fail("invalid number")),
        }
        if matches!(self.peek(), Some(b'.' | b'e' | b'E')) {
            return Err(self.fail("floating-point number"));
        }
        let value = self.text[start..self.pos]
            .parse::<i64>()
            .ok()
            .filter(|n| n.unsigned_abs() <= MAX_SAFE_INTEGER as u64)
            .ok_or_else(|| self.fail("integer outside the safe range"))?;
        Ok(JsonValue::Int(value))
    }
}
