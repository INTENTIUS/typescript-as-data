//! The value domain (values.md, F-Val-Domain) as this evaluator holds it.
//! Envelopes are plain objects carrying one of the six keys (F-Val-Envelope);
//! `Chain` is the optional-chain short-circuit sentinel of F-Eval-Member and
//! never escapes an expression; `Func` and `Host` are bindings a scope holds,
//! never values (F-Val-Callable).
use std::rc::Rc;

use crate::ast::FnDecl;

#[derive(Clone, Debug)]
pub enum V {
    Undefined,
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<V>),
    Obj(Obj),
    /// The optional-chain sentinel (grammar §2, L3.21).
    Chain,
    /// A project-local function bound in a scope (S-LocalFunction, F-Bind).
    Func(Rc<FnDecl>),
    /// A callable the host supplied (F-Eval-Ident step 3). Never bound in
    /// data-host, where the host is a description; kept so the `full`
    /// profile's rule has its case when a runtime is added.
    #[allow(dead_code)]
    Host(String),
    /// A synthetic namespace object (F-Namespace).
    Namespace(Obj),
}

/// An insertion-ordered object, the way JavaScript keeps own keys.
#[derive(Clone, Debug, Default)]
pub struct Obj(pub Vec<(String, V)>);

impl Obj {
    pub fn get(&self, k: &str) -> Option<&V> {
        self.0.iter().find(|(key, _)| key == k).map(|(_, v)| v)
    }
    /// Assigning an existing key keeps its position, as JavaScript does.
    pub fn set(&mut self, k: String, v: V) {
        if let Some(slot) = self.0.iter_mut().find(|(key, _)| *key == k) {
            slot.1 = v;
        } else {
            self.0.push((k, v));
        }
    }
    pub fn has(&self, k: &str) -> bool {
        self.0.iter().any(|(key, _)| key == k)
    }
}

pub const ENVELOPE_KEYS: [&str; 6] = ["__attrRef", "__intrinsic", "__helper", "__resource", "__compositeStep", "__symbol"];

impl V {
    pub fn is_envelope(&self) -> bool {
        matches!(self, V::Obj(o) if ENVELOPE_KEYS.iter().any(|k| o.has(k)))
    }
    pub fn envelope_key(&self) -> Option<&'static str> {
        match self {
            V::Obj(o) => ENVELOPE_KEYS.iter().copied().find(|k| o.has(k)),
            _ => None,
        }
    }
    pub fn is_callable(&self) -> bool {
        matches!(self, V::Func(_) | V::Host(_))
    }
    pub fn obj(pairs: Vec<(&str, V)>) -> V {
        V::Obj(Obj(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect()))
    }
    pub fn str(s: &str) -> V {
        V::Str(s.to_string())
    }
}

/// JSON for the harness. `undefined` and non-finite numbers, which JSON cannot
/// write, travel as tagged objects the adapter decodes; a function or host
/// binding that reached a namespace is named so the verdict stays comparable.
pub fn to_json(v: &V) -> serde_json::Value {
    use serde_json::{json, Map, Value};
    match v {
        V::Undefined | V::Chain => json!({ "$tsad": "undefined" }),
        V::Null => Value::Null,
        V::Bool(b) => Value::Bool(*b),
        V::Num(n) => {
            if n.is_finite() {
                if *n == 0.0 { json!(0) } else { serde_json::Number::from_f64(*n).map(Value::Number).unwrap_or(Value::Null) }
            } else {
                json!({ "$tsad": "number", "text": crate::js::number_to_string(*n) })
            }
        }
        V::Str(s) => Value::String(s.clone()),
        V::Arr(a) => Value::Array(a.iter().map(to_json).collect()),
        V::Obj(o) | V::Namespace(o) => {
            let mut m = Map::new();
            for (k, e) in &o.0 { m.insert(k.clone(), to_json(e)); }
            Value::Object(m)
        }
        V::Func(f) => json!({ "$tsad": "function", "name": f.name }),
        V::Host(n) => json!({ "$tsad": "host", "name": n }),
    }
}
