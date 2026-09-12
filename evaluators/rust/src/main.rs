//! An evaluator for the typescript-as-data data-host profile, written from
//! the specification (spec/*.md at the version below) with no JavaScript
//! runtime: oxc parses, this crate folds. It speaks JSON on stdin and
//! stdout so the conformance suite's adapter can drive it (#86).
mod ast;
mod eval;
mod js;
mod methods;
mod module;
mod value;

use std::collections::HashMap;
use std::io::Read;

use serde_json::{json, Value};

/// The specification version this evaluator declares (spec/VERSION).
const SPEC_VERSION: &str = "1.6";
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
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let req: Request = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => { println!("{}", json!({ "error": format!("bad request: {}", e) })); std::process::exit(2); }
    };
    let out = match req.op.as_str() {
        "version" => json!({ "specVersion": SPEC_VERSION, "profile": PROFILE, "name": format!("tsad-eval/{}", env!("CARGO_PKG_VERSION")) }),
        "shape" => shape(&req),
        "foldExport" => fold_export(&req),
        "foldProject" => fold_project(&req),
        other => json!({ "error": format!("unknown op {}", other) }),
    };
    println!("{}", out);
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
