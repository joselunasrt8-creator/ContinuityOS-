use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(String),
    String(String),
    Array(Vec<JsonValue>),
    Object(BTreeMap<String, JsonValue>),
}

impl JsonValue {
    pub fn object(fields: impl IntoIterator<Item = (impl Into<String>, JsonValue)>) -> Self {
        Self::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
    }
    pub fn array(items: impl IntoIterator<Item = JsonValue>) -> Self {
        Self::Array(items.into_iter().collect())
    }
    pub fn string(value: impl Into<String>) -> Self {
        Self::String(value.into())
    }
    pub fn number(value: impl Into<String>) -> Option<Self> {
        let value = value.into();
        if is_valid_json_number(&value) {
            Some(Self::Number(value))
        } else {
            None
        }
    }
    pub fn as_object(&self) -> Option<&BTreeMap<String, JsonValue>> {
        if let Self::Object(v) = self {
            Some(v)
        } else {
            None
        }
    }
    pub fn as_object_mut(&mut self) -> Option<&mut BTreeMap<String, JsonValue>> {
        if let Self::Object(v) = self {
            Some(v)
        } else {
            None
        }
    }
    pub fn as_array(&self) -> Option<&[JsonValue]> {
        if let Self::Array(v) = self {
            Some(v)
        } else {
            None
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        if let Self::String(v) = self {
            Some(v)
        } else {
            None
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum CanonicalizationError {
    MalformedNumber,
}

pub fn canonical_string(value: &JsonValue) -> Result<String, CanonicalizationError> {
    let mut out = String::new();
    write_canonical(value, &mut out)?;
    Ok(out)
}

pub fn canonical_bytes(value: &JsonValue) -> Result<Vec<u8>, CanonicalizationError> {
    Ok(canonical_string(value)?.into_bytes())
}

fn write_canonical(value: &JsonValue, out: &mut String) -> Result<(), CanonicalizationError> {
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(boolean) => out.push_str(if *boolean { "true" } else { "false" }),
        JsonValue::Number(number) => {
            if !is_valid_json_number(number) {
                return Err(CanonicalizationError::MalformedNumber);
            }
            out.push_str(number);
        }
        JsonValue::String(string) => write_json_string(string, out),
        JsonValue::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_canonical(item, out)?;
            }
            out.push(']');
        }
        JsonValue::Object(map) => {
            out.push('{');
            for (index, (key, item)) in map.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_json_string(key, out);
                out.push(':');
                write_canonical(item, out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

fn write_json_string(value: &str, out: &mut String) {
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if ch <= '\u{1f}' => out.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => out.push(ch),
        }
    }
    out.push('"');
}

fn is_valid_json_number(value: &str) -> bool {
    if value.is_empty() || value == "-" {
        return false;
    }
    let bytes = value.as_bytes();
    let mut index = 0;
    if bytes[index] == b'-' {
        index += 1;
        if index == bytes.len() {
            return false;
        }
    }
    if bytes[index] == b'0' {
        index += 1;
    } else if bytes[index].is_ascii_digit() && bytes[index] != b'0' {
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
    } else {
        return false;
    }
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == start {
            return false;
        }
    }
    if index < bytes.len() && (bytes[index] == b'e' || bytes[index] == b'E') {
        index += 1;
        if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
            index += 1;
        }
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == start {
            return false;
        }
    }
    index == bytes.len()
}
