//! A generator (F-Val-Source, #80): from a namespace of values to one module
//! in the subset whose fold, in `data-host`, is that namespace. The forms are
//! the ones F-Val-Source's table names, one per case, the same choices as the
//! reference's `generate.ts`, and nothing is factored. A value with no form
//! here is reported rather than approximated.
use crate::eval::Host;
use crate::js;
use crate::value::{Obj, V};

/// The harness's JSON, with `undefined` and a non-finite number as the
/// tagged objects `value::to_json` writes, read back into the domain.
pub fn from_json(v: &serde_json::Value) -> V {
    use serde_json::Value;
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Bool(*b),
        Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => V::Str(s.clone()),
        Value::Array(a) => V::Arr(a.iter().map(from_json).collect()),
        Value::Object(m) => {
            if let Some(Value::String(tag)) = m.get("$tsad") {
                return match tag.as_str() {
                    "undefined" => V::Undefined,
                    "number" => V::Num(m.get("text").and_then(|t| t.as_str()).map(js::string_to_number).unwrap_or(f64::NAN)),
                    _ => V::Obj(Obj(m.iter().map(|(k, e)| (k.clone(), from_json(e))).collect())),
                };
            }
            V::Obj(Obj(m.iter().map(|(k, e)| (k.clone(), from_json(e))).collect()))
        }
    }
}

fn is_ident(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$'),
        _ => false,
    }
}

fn quote(s: &str) -> String {
    serde_json::to_string(s).expect("a string is JSON")
}

fn escape_span(s: &str) -> String {
    s.replace('\\', "\\\\").replace('`', "\\`").replace("${", "\\${")
}

struct Gen<'h> {
    host: &'h Host,
    imports: Vec<String>,
    entities: Vec<String>,
}

impl Gen<'_> {
    fn needs(&mut self, name: &str) -> Result<(), String> {
        if self.host.owned_specifier_prefixes.is_empty() { return Err(format!("{} needs a host specifier to import from", name)); }
        if !self.imports.iter().any(|i| i == name) { self.imports.push(name.to_string()); }
        Ok(())
    }

    fn expr(&mut self, v: &V, interior: bool) -> Result<String, String> {
        match v {
            V::Undefined => Ok("undefined".into()),
            V::Null => Ok("null".into()),
            V::Bool(b) => Ok(b.to_string()),
            V::Str(s) => Ok(quote(s)),
            V::Num(n) => Ok(js::number_to_string(*n)),
            V::Arr(a) => Ok(format!("[{}]", a.iter().map(|e| self.expr(e, interior)).collect::<Result<Vec<_>, _>>()?.join(", "))),
            V::Obj(o) => self.object(o, interior),
            V::Chain | V::Func(_) | V::Host(_) | V::Namespace(_) => Err("not a value of the domain".into()),
        }
    }

    fn object(&mut self, o: &Obj, interior: bool) -> Result<String, String> {
        match V::Obj(o.clone()).envelope_key() {
            Some("__attrRef") => {
                let r = match o.get("__attrRef") { Some(V::Obj(r)) => r, _ => return Err("a malformed attribute reference".into()) };
                let (entity, attribute) = match (r.get("entity"), r.get("attribute")) {
                    (Some(V::Str(e)), Some(V::Str(a))) => (e.clone(), a.clone()),
                    _ => return Err("a malformed attribute reference".into()),
                };
                // An attribute reference names a same-file `const` bound to a `new` (F-Eval-Member step 1).
                if !self.entities.contains(&entity) { return Err(format!("attribute reference to {}, which is not a resource in this namespace", entity)); }
                Ok(if is_ident(&attribute) { format!("{}.{}", entity, attribute) } else { format!("{}[{}]", entity, quote(&attribute)) })
            }
            Some("__intrinsic") => {
                let name = match o.get("__intrinsic") { Some(V::Str(n)) => n.clone(), _ => return Err("a malformed intrinsic".into()) };
                self.needs(&name)?;
                if let Some(V::Arr(strings)) = o.get("strings") {
                    let values = match o.get("values") { Some(V::Arr(v)) => v.clone(), _ => Vec::new() };
                    let mut out = String::new();
                    for (i, s) in strings.iter().enumerate() {
                        if let V::Str(s) = s { out.push_str(&escape_span(s)); }
                        if i < values.len() { out.push_str("${"); out.push_str(&self.expr(&values[i], true)?); out.push('}'); }
                    }
                    return Ok(format!("{}`{}`", name, out));
                }
                let args = match o.get("args") { Some(V::Arr(a)) => a.clone(), _ => Vec::new() };
                Ok(format!("{}({})", name, args.iter().map(|a| self.expr(a, true)).collect::<Result<Vec<_>, _>>()?.join(", ")))
            }
            Some("__helper") => Err("a helper call has no form in data-host: the profile has no helpers".into()),
            Some("__compositeStep") => Err("a composite step has no form here: no composite factory form".into()),
            Some("__resource") => {
                let cls = match o.get("__resource") { Some(V::Str(c)) => c.clone(), _ => return Err("a malformed resource".into()) };
                self.needs(&cls)?;
                if let Some(V::Arr(args)) = o.get("args") {
                    return Ok(format!("new {}({})", cls, args.iter().map(|a| self.expr(a, false)).collect::<Result<Vec<_>, _>>()?.join(", ")));
                }
                let props = self.expr(o.get("props").unwrap_or(&V::Obj(Obj::default())), false)?;
                Ok(match o.get("attributes") {
                    Some(attrs) => format!("new {}({}, {})", cls, props, self.expr(attrs, false)?),
                    None => format!("new {}({})", cls, props),
                })
            }
            Some("__symbol") => {
                if !interior { return Err("a symbol has a form only inside an intrinsic (F-Val-Symbol-Scope)".into()); }
                match o.get("__symbol") { Some(V::Str(s)) => Ok(s.clone()), _ => Err("a malformed symbol".into()) }
            }
            _ => {
                let mut fields = Vec::new();
                for (k, e) in &o.0 {
                    fields.push(format!("{}: {}", if is_ident(k) { k.clone() } else { quote(k) }, self.expr(e, interior)?));
                }
                Ok(format!("{{ {} }}", fields.join(", ")))
            }
        }
    }
}

/// One module whose fold is `namespace`, or the reason no form exists.
pub fn generate(namespace: &Obj, host: &Host) -> Result<String, String> {
    let entities = namespace.0.iter().filter(|(_, v)| v.envelope_key() == Some("__resource")).map(|(k, _)| k.clone()).collect();
    let mut g = Gen { host, imports: Vec::new(), entities };
    let mut body = Vec::new();
    for (name, v) in &namespace.0 {
        body.push(format!("export const {} = {};", name, g.expr(v, false)?));
    }
    let mut out = String::new();
    if !g.imports.is_empty() {
        g.imports.sort();
        out.push_str(&format!("import {{ {} }} from {};\n\n", g.imports.join(", "), quote(&host.owned_specifier_prefixes[0])));
    }
    for line in body { out.push_str(&line); out.push('\n'); }
    Ok(out)
}
