//! What a form field is: its kind and the identifier the rule matches entry keys against.

use serde::{Deserialize, Serialize};

use crate::aliases::card_token;

/// The attributes of an `<input>` the rule looks at. Missing attributes are empty.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FieldFacts {
    /// The `type` attribute (`text`, `password`, `email`, …).
    pub input_type: String,
    pub name: String,
    pub id: String,
    pub autocomplete: String,
    pub placeholder: String,
}

/// What a field asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    Username,
    Password,
    Email,
    Otp,
    Text,
}

impl FieldKind {
    pub fn as_str(self) -> &'static str {
        match self {
            FieldKind::Username => "username",
            FieldKind::Password => "password",
            FieldKind::Email => "email",
            FieldKind::Otp => "otp",
            FieldKind::Text => "text",
        }
    }
}

const PASSWORD_PATTERNS: [&str; 5] = ["pass", "password", "passwd", "pwd", "secret"];
const OTP_PATTERNS: [&str; 5] = ["otp", "totp", "2fa", "mfa", "verification"];
const EMAIL_PATTERNS: [&str; 2] = ["email", "mail"];
const USERNAME_PATTERNS: [&str; 6] = ["user", "login", "username", "nick", "nickname", "handle"];

fn name_tokens(text: &str) -> Vec<String> {
    let mut separated = String::new();
    let mut chars = text.chars().peekable();
    let mut previous: Option<char> = None;
    while let Some(c) = chars.next() {
        if c.is_uppercase()
            && previous.is_some_and(|prev| {
                prev.is_lowercase()
                    || ((prev.is_uppercase() || prev.is_numeric())
                        && chars.peek().is_some_and(|next| next.is_lowercase()))
            })
        {
            separated.push(' ');
        }
        separated.push(c);
        previous = Some(c);
    }
    separated
        .split(|c: char| !c.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// The kind of a field: card `autocomplete` tokens, then its `type`, then its `autocomplete`,
/// then words in its name, `id` or placeholder. A card field is plain text even when masked as a
/// password, so it never falls back to a login password or a one-time code.
pub fn field_kind(field: &FieldFacts) -> FieldKind {
    if card_token(&field.autocomplete).is_some() {
        return FieldKind::Text;
    }
    match field.input_type.to_lowercase().as_str() {
        "password" => return FieldKind::Password,
        "email" => return FieldKind::Email,
        _ => {}
    }

    let autocomplete = field.autocomplete.to_lowercase();
    for token in autocomplete.split_ascii_whitespace() {
        match token {
            "current-password" | "new-password" => return FieldKind::Password,
            "email" => return FieldKind::Email,
            "username" => return FieldKind::Username,
            "one-time-code" => return FieldKind::Otp,
            _ => {}
        }
    }

    let tokens = name_tokens(&format!(
        "{} {} {}",
        field.name, field.id, field.placeholder
    ));
    // Numeric suffixes index repeated inputs, including individual OTP boxes.
    let mentions = |patterns: &[&str]| {
        tokens
            .iter()
            .any(|token| patterns.contains(&token.trim_end_matches(|c: char| c.is_ascii_digit())))
    };
    // ponytail: word heuristics cannot infer a field's meaning; ambiguous words only count as
    // whole attributes. Other names need explicit autocomplete or entry aliases.
    let named = |names: &[&str]| {
        [&field.name, &field.id, &field.placeholder]
            .iter()
            .any(|text| {
                names
                    .iter()
                    .any(|name| text.trim().eq_ignore_ascii_case(name))
            })
    };
    if mentions(&PASSWORD_PATTERNS) {
        FieldKind::Password
    } else if mentions(&OTP_PATTERNS) || named(&["code", "token"]) {
        FieldKind::Otp
    } else if mentions(&EMAIL_PATTERNS) {
        FieldKind::Email
    } else if mentions(&USERNAME_PATTERNS) || named(&["account"]) {
        FieldKind::Username
    } else {
        FieldKind::Text
    }
}

/// The identifier matched against entry keys: the name, else the `id`, else the `autocomplete`
/// value (unless `off`), else the kind.
pub fn field_identifier(field: &FieldFacts) -> String {
    if !field.name.is_empty() {
        field.name.clone()
    } else if !field.id.is_empty() {
        field.id.clone()
    } else if !field.autocomplete.is_empty() && !field.autocomplete.eq_ignore_ascii_case("off") {
        field.autocomplete.clone()
    } else {
        field_kind(field).as_str().to_owned()
    }
}
