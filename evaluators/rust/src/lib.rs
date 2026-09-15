//! An evaluator for the typescript-as-data data-host profile, written from
//! the specification (spec/*.md at the version below) with no JavaScript
//! runtime: oxc parses, this crate folds. One entry point, `handle`, takes a
//! request as JSON text and returns the answer as JSON text; the binary in
//! main.rs puts it on stdin and stdout for the conformance adapter (#86),
//! and the wasm exports below put it in a linear-memory buffer so a host with
//! no process to spawn, a browser or an editor, can call it in place.
mod ast;
mod eval;
mod generate;
mod js;
mod methods;
mod module;
mod value;

use std::collections::HashMap;

use serde_json::{json, Value};

/// The specification version this evaluator declares (spec/VERSION).
const SPEC_VERSION: &str = "2.0";
const PROFILE: &str = "data-host";

#[derive(serde::Deserialize)]
struct Request {
    op: String,
    #[serde(default)]
    files: HashMap<String, String>,
    #[serde(default)]
    entry: Option<String>,
    #[serde(default)]
    export: Option<String>,
    #[serde(default)]
    host: eval::Host,
    /// `generate`'s input, a namespace as `to_json` writes one.
    #[serde(default)]
    namespace: Option<serde_json::Value>,
}


/// One request in, one answer out, both JSON text. Every transport is a wrapper over this.
pub fn handle(input: &str) -> String {
    let req: Request = match serde_json::from_str(input) {
        Ok(r) => r,
        Err(e) => return json!({ "error": format!("bad request: {}", e) }).to_string(),
    };
    let out = match req.op.as_str() {
        "version" => json!({ "specVersion": SPEC_VERSION, "profile": PROFILE, "name": format!("tsad-eval/{}", env!("CARGO_PKG_VERSION")) }),
        "shape" => shape(&req),
        "foldExport" => fold_export(&req),
        "foldProject" => fold_project(&req),
        "generate" => generate(&req),
        other => json!({ "error": format!("unknown op {}", other) }),
    };
    out.to_string()
}

// ── the wasm surface ────────────────────────────────────────────────────────
//
// A caller allocates a buffer with `tsad_alloc`, writes the request's UTF-8
// bytes into it, and calls `tsad_eval` with the pointer and length. The
// answer comes back as a pointer to a buffer whose first four bytes are the
// answer's length, little-endian, followed by that many bytes of UTF-8. The
// caller frees the request buffer with `tsad_free(ptr, len)` and the answer
// with `tsad_free(ptr, len + 4)`. No runtime, no imports, no I/O: the module
// instantiates with an empty import object.

#[no_mangle]
pub extern "C" fn tsad_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` must have come from `tsad_alloc(len)` or be an answer from `tsad_eval` with `len` its length plus four.
#[no_mangle]
pub unsafe extern "C" fn tsad_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() { drop(Vec::from_raw_parts(ptr, 0, len)); }
}

/// # Safety
/// `ptr` and `len` must describe a readable buffer of UTF-8 the caller owns.
#[no_mangle]
pub unsafe extern "C" fn tsad_eval(ptr: *const u8, len: usize) -> *mut u8 {
    let input = std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len));
    let out = handle(input);
    let bytes = out.as_bytes();
    let mut buf = Vec::<u8>::with_capacity(bytes.len() + 4);
    buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(bytes);
    let p = buf.as_mut_ptr();
    std::mem::forget(buf);
    p
}

fn entry_of(req: &Request) -> (String, String) {
    let path = req.entry.clone().unwrap_or_else(|| "input.ts".into());
    let text = req.files.get(&path).cloned().unwrap_or_default();
    (path, text)
}

/// The initializer of one export, as the expression fixtures judge it.
fn initializer(m: &ast::Module, name: &str) -> Option<ast::Expr> {
    for d in &m.declarators {
        match d {
            ast::Declarator::Resource { name: n, expr } | ast::Declarator::Single { name: n, expr } if n == name => return Some(expr.clone()),
            ast::Declarator::Default(expr) if name == "default" => return Some(expr.clone()),
            _ => {}
        }
    }
    None
}

/// The function an `export function` or `export const f = () => …` binds, when `name` is one.
fn exported_function<'m>(m: &'m ast::Module, name: &str) -> Option<&'m std::rc::Rc<ast::FnDecl>> {
    let exported = m.declarators.iter().any(|d| matches!(d, ast::Declarator::Function(n) if n == name));
    if exported { m.functions.iter().find(|f| f.name == name) } else { None }
}

fn shape(req: &Request) -> Value {
    let (path, text) = entry_of(req);
    let name = req.export.clone().unwrap_or_default();
    let m = match ast::parse_module(&path, &text, true) {
        Ok(m) => m,
        Err(e) => return json!({ "accepted": false, "rule": "F-Scan", "line": 1, "column": 1, "message": e }),
    };
    if let Some(f) = exported_function(&m, &name) { return json!({ "accepted": false, "rule": "S-Reject", "line": f.loc.line, "column": f.loc.column, "message": "a function used as a value is not foldable" }); }
    let Some(e) = initializer(&m, &name) else { return json!({ "accepted": false, "line": 1, "column": 1, "message": format!("no export named {}", name) }) };
    // S-CallLocal: a callee this file binds by S-LocalFunction or by an import from a project specifier.
    let mut local: Vec<String> = m.functions.iter().map(|f| f.name.clone()).collect();
    local.extend(m.imports.iter().filter(|i| module::is_project(&i.specifier)).map(|i| i.local.clone()));
    match eval::shape(&e, &req.host, &local) {
        None => json!({ "accepted": true }),
        Some(v) => json!({ "accepted": false, "rule": v.rule, "line": v.loc.line, "column": v.loc.column, "message": v.message }),
    }
}

fn fold_export(req: &Request) -> Value {
    let (path, text) = entry_of(req);
    let name = req.export.clone().unwrap_or_default();
    let mut files = req.files.clone();
    files.entry(path.clone()).or_insert(text);
    // An expression fixture judges the initializer: an exported function is F-Eval-Function's rejection, not a binding.
    if let Ok(m) = ast::parse_module(&path, files.get(&path).expect("entry"), true) {
        if let Some(f) = exported_function(&m, &name) { return json!({ "ok": false, "rule": "F-Eval-Function", "line": f.loc.line, "column": f.loc.column, "message": "a function used as a value is not foldable" }); }
    }
    let mut project = module::Project::new(files, &req.host);
    // The file's verdict carries the located rejection.
    match project.fold_file(&path) {
        module::Verdict::Fold(exports) => match exports.iter().find(|(k, _)| *k == name) {
            Some((_, v)) => json!({ "ok": true, "value": value::to_json(v) }),
            None => json!({ "ok": false, "rule": "S-Module", "line": 1, "column": 1, "message": format!("no export named {}", name) }),
        },
        module::Verdict::Run { rule, loc, reason } => {
            let l = loc.unwrap_or(ast::Loc { line: 1, column: 1 });
            json!({ "ok": false, "rule": rule, "line": l.line, "column": l.column, "message": reason })
        }
    }
}

fn fold_project(req: &Request) -> Value {
    let mut project = module::Project::new(req.files.clone(), &req.host);
    let mut verdicts = serde_json::Map::new();
    for (path, v) in project.fold_all() {
        verdicts.insert(path, match v {
            module::Verdict::Fold(exports) => {
                let mut m = serde_json::Map::new();
                for (k, e) in &exports { m.insert(k.clone(), value::to_json(e)); }
                json!({ "kind": "fold", "exports": m })
            }
            module::Verdict::Run { rule, loc, reason } => json!({ "kind": "run", "rule": rule, "reason": match loc { Some(l) => format!("{}:{} - {}", l.line, l.column, reason), None => reason } }),
        });
    }
    json!({ "verdicts": verdicts })
}

/// F-Val-Source (#80): source whose fold is the namespace, or why there is none.
fn generate(req: &Request) -> Value {
    let ns = match req.namespace.as_ref().map(generate::from_json) {
        Some(value::V::Obj(o)) => o,
        _ => return json!({ "error": "generate needs a namespace object" }),
    };
    match generate::generate(&ns, &req.host) {
        Ok(source) => json!({ "source": source }),
        Err(reason) => json!({ "unavailable": reason }),
    }
}
