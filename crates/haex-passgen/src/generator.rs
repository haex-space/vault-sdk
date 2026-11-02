use serde::{Deserialize, Serialize};

/// The shortest password outside pattern mode.
pub const MIN_LENGTH: u32 = 1;
/// The longest password outside pattern mode.
pub const MAX_LENGTH: u32 = 256;

/// The character classes, in this order: uppercase, lowercase, numbers, symbols.
pub const CLASS_CHARS: [&str; 4] = [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "!@#$%^&*()_+-=[]{}|;:,.<>?",
];

/// The letters of pattern mode and the characters each stands for.
pub const PATTERN_CHARS: [(char, &str); 8] = [
    ('c', "bcdfghjklmnpqrstvwxyz"),
    ('C', "BCDFGHJKLMNPQRSTVWXYZ"),
    ('v', "aeiou"),
    ('V', "AEIOU"),
    ('d', CLASS_CHARS[2]),
    ('a', CLASS_CHARS[1]),
    ('A', CLASS_CHARS[0]),
    ('s', CLASS_CHARS[3]),
];

/// What to generate: the shape of a saved generator preset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneratorConfig {
    pub length: u32,
    pub uppercase: bool,
    pub lowercase: bool,
    pub numbers: bool,
    pub symbols: bool,
    pub exclude_chars: String,
    pub use_pattern: bool,
    pub pattern: String,
}

impl Default for GeneratorConfig {
    /// 20 characters of all four classes.
    fn default() -> Self {
        Self {
            length: 20,
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: true,
            exclude_chars: String::new(),
            use_pattern: false,
            pattern: String::new(),
        }
    }
}

/// Why a configuration allows no password.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GeneratorError {
    /// The length is outside [`MIN_LENGTH`]..=[`MAX_LENGTH`].
    LengthRange,
    /// No class is chosen.
    NoClass,
    /// The length is shorter than the number of chosen classes.
    LengthBelowClasses,
    /// The excluded characters leave a chosen class empty.
    ClassEmpty,
    /// Pattern mode with an empty pattern.
    PatternEmpty,
}

impl GeneratorError {
    /// The code, as the windows name their messages.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::LengthRange => "length_range",
            Self::NoClass => "no_class",
            Self::LengthBelowClasses => "length_below_classes",
            Self::ClassEmpty => "class_empty",
            Self::PatternEmpty => "pattern_empty",
        }
    }
}

impl std::fmt::Display for GeneratorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::error::Error for GeneratorError {}

const RANGE: u64 = 1 << 32;

/// A uniform index in `0..max` by rejection sampling: draws that fall into the uneven tail of the
/// 32 bit range are dropped, so no choice is more likely than another. One choice or none needs no
/// draw.
pub fn random_index(max: usize, random: &mut impl FnMut() -> u32) -> usize {
    if max <= 1 {
        return 0;
    }
    let max = max as u64;
    let limit = RANGE - (RANGE % max);
    loop {
        let draw = u64::from(random());
        if draw < limit {
            return (draw % max) as usize;
        }
    }
}

fn pick(chars: &[char], random: &mut impl FnMut() -> u32) -> char {
    chars[random_index(chars.len(), random)]
}

/// Fisher–Yates with the same random source.
fn shuffle(chars: &mut [char], random: &mut impl FnMut() -> u32) {
    for i in (1..chars.len()).rev() {
        let j = random_index(i + 1, random);
        chars.swap(i, j);
    }
}

fn from_pattern(pattern: &str, random: &mut impl FnMut() -> u32) -> Result<String, GeneratorError> {
    if pattern.is_empty() {
        return Err(GeneratorError::PatternEmpty);
    }
    let mut out = String::new();
    let mut chars = pattern.chars().peekable();
    while let Some(char) = chars.next() {
        if char == '\\' {
            if let Some(next) = chars.next() {
                out.push(next);
                continue;
            }
        }
        match PATTERN_CHARS.iter().find(|(letter, _)| *letter == char) {
            Some((_, set)) => out.push(pick(&set.chars().collect::<Vec<_>>(), random)),
            None => out.push(char),
        }
    }
    Ok(out)
}

/// A password for `config`, drawing from `random`; the caller supplies the source, so tests can
/// be deterministic.
pub fn generate_with(
    config: &GeneratorConfig,
    random: &mut impl FnMut() -> u32,
) -> Result<String, GeneratorError> {
    if config.use_pattern {
        return from_pattern(&config.pattern, random);
    }
    if !(MIN_LENGTH..=MAX_LENGTH).contains(&config.length) {
        return Err(GeneratorError::LengthRange);
    }
    let chosen = [
        config.uppercase,
        config.lowercase,
        config.numbers,
        config.symbols,
    ];
    let classes: Vec<Vec<char>> = CLASS_CHARS
        .iter()
        .zip(chosen)
        .filter(|(_, on)| *on)
        .map(|(chars, _)| {
            chars
                .chars()
                .filter(|char| !config.exclude_chars.contains(*char))
                .collect()
        })
        .collect();
    if classes.is_empty() {
        return Err(GeneratorError::NoClass);
    }
    let length = config.length as usize;
    if length < classes.len() {
        return Err(GeneratorError::LengthBelowClasses);
    }
    if classes.iter().any(Vec::is_empty) {
        return Err(GeneratorError::ClassEmpty);
    }
    let all: Vec<char> = classes.concat();
    let mut out: Vec<char> = classes.iter().map(|chars| pick(chars, random)).collect();
    while out.len() < length {
        out.push(pick(&all, random));
    }
    shuffle(&mut out, random);
    Ok(out.into_iter().collect())
}

/// A password for `config` from the operating system's randomness (in the browser
/// `crypto.getRandomValues`).
///
/// # Panics
///
/// When the platform has no source of randomness, which is never the case where haex-pass runs.
pub fn generate_password(config: &GeneratorConfig) -> Result<String, GeneratorError> {
    generate_with(config, &mut || {
        let mut bytes = [0u8; 4];
        getrandom::getrandom(&mut bytes).expect("the platform's randomness");
        u32::from_le_bytes(bytes)
    })
}
