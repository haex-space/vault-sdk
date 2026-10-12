//! The `tools` block of a manifest: tools an extension offers to the agent of its host (holzi spec
//! 018, `contracts/manifest-tools.md`). This checks the shape every host relies on; what a host can
//! offer (for example which JSON schemas its model connection supports) is the host's own check.

use std::collections::{BTreeMap, HashSet};

use crate::jcs::JsonValue;

/// At most this many tools per extension.
pub const MAX_TOOLS: usize = 32;
const MAX_NAME_LEN: usize = 32;
const MAX_TITLE_CHARS: usize = 80;
const MAX_DESCRIPTION_CHARS: usize = 1024;
const MAX_EXAMPLES: usize = 10;
const MAX_EXAMPLE_CHARS: usize = 200;
const MAX_SCHEMA_DEPTH: usize = 8;
const LANGUAGES: [&str; 2] = ["de", "en"];
const EFFECTS: [&str; 3] = ["read", "change", "destructive"];
const TOOL_KEYS: [&str; 6] = [
    "description",
    "effect",
    "examples",
    "inputSchema",
    "name",
    "title",
];
const SCHEMA_KEYS: [&str; 6] = [
    "type",
    "description",
    "properties",
    "required",
    "items",
    "enum",
];

/// Checks the `tools` value of a manifest; the error names the first rule it breaks.
pub fn check_tools(tools: &JsonValue) -> Result<(), String> {
    let JsonValue::Array(tools) = tools else {
        return Err("tools is not an array".into());
    };
    if tools.len() > MAX_TOOLS {
        return Err(format!(
            "tools has {} entries, more than {MAX_TOOLS}",
            tools.len()
        ));
    }
    let mut names = HashSet::new();
    for (index, tool) in tools.iter().enumerate() {
        let tool = tool
            .as_object()
            .ok_or_else(|| format!("tools[{index}] is not an object"))?;
        let name = check_tool(tool).map_err(|reason| format!("tools[{index}]: {reason}"))?;
        if !names.insert(name) {
            return Err(format!("tools[{index}]: the name {name} is used twice"));
        }
    }
    Ok(())
}

fn check_tool(tool: &BTreeMap<String, JsonValue>) -> Result<&str, String> {
    if let Some(key) = tool.keys().find(|key| !TOOL_KEYS.contains(&key.as_str())) {
        return Err(format!("unknown key {key}"));
    }
    let name = tool.get("name").and_then(JsonValue::as_str).unwrap_or("");
    if !is_valid_tool_name(name) {
        return Err(format!("name {name:?} must match ^[a-z][a-z0-9_]{{0,31}}$"));
    }
    per_language(tool.get("title"), "title", |title| {
        text(title, 1, MAX_TITLE_CHARS)
    })?;
    let description = tool.get("description").and_then(JsonValue::as_str);
    if !description.is_some_and(|d| within(d, 1, MAX_DESCRIPTION_CHARS)) {
        return Err(format!(
            "description must be text of 1 to {MAX_DESCRIPTION_CHARS} characters"
        ));
    }
    check_schema(tool.get("inputSchema"))?;
    let effect = tool.get("effect").and_then(JsonValue::as_str);
    if !effect.is_some_and(|e| EFFECTS.contains(&e)) {
        return Err(format!(
            "effect {effect:?} is not read, change or destructive"
        ));
    }
    per_language(tool.get("examples"), "examples", |examples| {
        let JsonValue::Array(examples) = examples else {
            return false;
        };
        (1..=MAX_EXAMPLES).contains(&examples.len())
            && examples
                .iter()
                .all(|example| text(example, 1, MAX_EXAMPLE_CHARS))
    })?;
    Ok(name)
}

fn is_valid_tool_name(name: &str) -> bool {
    let mut chars = name.chars();
    name.len() <= MAX_NAME_LEN
        && chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// `value` is an object with exactly the keys `de` and `en`, each accepted by `valid`.
fn per_language(
    value: Option<&JsonValue>,
    field: &str,
    valid: impl Fn(&JsonValue) -> bool,
) -> Result<(), String> {
    let ok = value.and_then(JsonValue::as_object).is_some_and(|map| {
        map.len() == LANGUAGES.len()
            && LANGUAGES
                .iter()
                .all(|language| map.get(*language).is_some_and(&valid))
    });
    if ok {
        Ok(())
    } else {
        Err(format!(
            "{field} must hold de and en, and nothing else, within its limits"
        ))
    }
}

fn text(value: &JsonValue, min: usize, max: usize) -> bool {
    value.as_str().is_some_and(|text| within(text, min, max))
}

fn within(text: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&text.chars().count())
}

fn check_schema(schema: Option<&JsonValue>) -> Result<(), String> {
    let schema = schema
        .and_then(JsonValue::as_object)
        .ok_or("inputSchema is not an object")?;
    if schema.get("type").and_then(JsonValue::as_str) != Some("object") {
        return Err("inputSchema must have type object".into());
    }
    check_schema_keys(schema)?;
    if depth(&JsonValue::Object(schema.clone())) > MAX_SCHEMA_DEPTH {
        return Err(format!(
            "inputSchema is nested deeper than {MAX_SCHEMA_DEPTH}"
        ));
    }
    Ok(())
}

fn check_schema_keys(schema: &BTreeMap<String, JsonValue>) -> Result<(), String> {
    if let Some(key) = schema
        .keys()
        .find(|key| !SCHEMA_KEYS.contains(&key.as_str()))
    {
        return Err(format!("inputSchema has unknown key {key}"));
    }
    if let Some(properties) = schema.get("properties").and_then(JsonValue::as_object) {
        for property in properties.values().filter_map(JsonValue::as_object) {
            check_schema_keys(property)?;
        }
    }
    if let Some(items) = schema.get("items").and_then(JsonValue::as_object) {
        check_schema_keys(items)?;
    }
    Ok(())
}

fn depth(value: &JsonValue) -> usize {
    match value {
        JsonValue::Array(items) => 1 + items.iter().map(depth).max().unwrap_or(0),
        JsonValue::Object(map) => 1 + map.values().map(depth).max().unwrap_or(0),
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::check_tools;
    use crate::jcs::parse_restricted;

    #[test]
    fn rejects_unsupported_keywords_in_nested_property_schemas() {
        let manifest = parse_restricted(
            r#"[{"name":"count_unread","title":{"de":"Ungelesene zählen","en":"Count unread"},"description":"Counts unread items.","inputSchema":{"type":"object","properties":{"count":{"type":"integer","minimum":0}}},"effect":"read","examples":{"de":["Wie viele ungelesene habe ich?"],"en":["How many unread do I have?"]}}]"#,
        )
        .unwrap();

        let error = check_tools(&manifest).unwrap_err();
        assert!(error.contains("unknown key minimum"), "{error}");
    }

    #[test]
    fn rejects_unsupported_keywords_in_array_item_schemas() {
        let manifest = parse_restricted(
            r#"[{"name":"count_unread","title":{"de":"Ungelesene zählen","en":"Count unread"},"description":"Counts unread items.","inputSchema":{"type":"object","properties":{"tags":{"type":"array","items":{"type":"string","pattern":".*"}}}},"effect":"read","examples":{"de":["Wie viele ungelesene habe ich?"],"en":["How many unread do I have?"]}}]"#,
        )
        .unwrap();

        let error = check_tools(&manifest).unwrap_err();
        assert!(error.contains("unknown key pattern"), "{error}");
    }
}
