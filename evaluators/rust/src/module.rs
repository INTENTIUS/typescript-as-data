//! J2, the per-file verdict, in the data-host profile: `ι = isolated` always,
//! a file that does not fold is an error and never a demotion, and J3 is
//! absent because nothing runs. F-Import resolves project specifiers by
//! folding the sibling first (F-Memo, F-Cycle) and host specifiers to names
//! the host owns; a bare specifier the host does not own is not resolved.
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use crate::ast::{parse_module, Declarator, ImportKind, Loc, Module};
use crate::eval::{self, Ctx, Host, Reject, Scope};
use crate::value::{Obj, V};

#[derive(Clone, Debug)]
pub enum Verdict {
    Fold(Vec<(String, V)>),
    Run { rule: &'static str, loc: Option<Loc>, reason: String },
}

pub struct Project<'h> {
    pub files: HashMap<String, String>,
    pub host: &'h Host,
    memo: HashMap<String, Verdict>,
    stack: Vec<String>,
    fn_scopes: HashMap<String, Rc<Scope>>,
}

impl<'h> Project<'h> {
    pub fn new(files: HashMap<String, String>, host: &'h Host) -> Project<'h> {
        Project { files, host, memo: HashMap::new(), stack: vec![], fn_scopes: HashMap::new() }
    }

    pub fn fold_all(&mut self) -> Vec<(String, Verdict)> {
        let mut paths: Vec<String> = self.files.keys().cloned().collect();
        paths.sort();
        for p in &paths { self.fold_file(p); }
        paths.into_iter().map(|p| { let v = self.memo.get(&p).cloned().expect("memoised"); (p, v) }).collect()
    }

    /// F-Memo: at most one verdict per file per build.
    pub fn fold_file(&mut self, path: &str) -> Verdict {
        if let Some(v) = self.memo.get(path) { return v.clone(); }
        if self.stack.iter().any(|p| p == path) {
            // F-Cycle: a file already on the resolution stack does not fold.
            let v = Verdict::Run { rule: "F-Cycle", loc: None, reason: format!("{} is in an import cycle", path) };
            return v;
        }
        self.stack.push(path.to_string());
        let v = self.fold_file_core(path);
        self.stack.pop();
        self.memo.insert(path.to_string(), v.clone());
        v
    }

    fn fold_file_core(&mut self, path: &str) -> Verdict {
        let text = self.files.get(path).cloned().expect("a file of the project");
        let m = match parse_module(path, &text, true) {
            Ok(m) => m,
            Err(e) => return Verdict::Run { rule: "F-Scan", loc: Some(Loc { line: 1, column: 1 }), reason: e },
        };
        if let Some((loc, why)) = &m.disqualified {
            return Verdict::Run { rule: "F-Scan", loc: Some(*loc), reason: why.clone() };
        }
        if m.declarators.is_empty() {
            return Verdict::Run { rule: "F-NoExports", loc: None, reason: "no foldable resource exports".into() };
        }
        match self.namespace_of(path, &m) {
            Ok(exports) => Verdict::Fold(exports),
            Err(r) => Verdict::Run { rule: r.rule, loc: Some(r.loc), reason: r.message },
        }
    }

    /// F-Bind, F-Import, F-Prebuild, F-Declarator, F-Total.
    fn namespace_of(&mut self, path: &str, m: &Module) -> Result<Vec<(String, V)>, Reject> {
        let mut scope = Scope { consts: HashMap::new(), externals: HashMap::new(), depth: 0 };
        for (name, e, is_new) in &m.consts { scope.consts.insert(name.clone(), (e.clone(), *is_new)); }
        // F-Bind: every S-LocalFunction, exported or not.
        for f in &m.functions { scope.externals.insert(f.name.clone(), V::Func(f.clone())); }
        // F-Import.
        let mut unresolved: HashMap<String, String> = HashMap::new();
        for imp in &m.imports {
            if is_project(&imp.specifier) {
                let target = resolve(path, &imp.specifier, &self.files);
                let Some(target) = target else { unresolved.insert(imp.local.clone(), format!("{} does not resolve to a file of the project", imp.specifier)); continue };
                match self.fold_file(&target) {
                    Verdict::Fold(exports) => {
                        let value = match &imp.kind {
                            ImportKind::Named(n) => exports.iter().find(|(k, _)| k == n).map(|(_, v)| v.clone()),
                            ImportKind::Default => exports.iter().find(|(k, _)| k == "default").map(|(_, v)| v.clone()),
                            ImportKind::Namespace => Some(V::Namespace(Obj(exports.clone()))),
                        };
                        match value {
                            Some(v) => { scope.externals.insert(imp.local.clone(), v); }
                            None => { unresolved.insert(imp.local.clone(), format!("{} exports no `{}`", target, match &imp.kind { ImportKind::Named(n) => n.as_str(), _ => "default" })); }
                        }
                    }
                    Verdict::Run { reason, .. } => { unresolved.insert(imp.local.clone(), format!("{} does not fold: {}", target, reason)); }
                }
            } else if self.host.owns(&imp.specifier) {
                // F-Import arm 1 binds the package's real export; in data-host the
                // host is a description and has none (F-Host-Interface items 1 and
                // 2 absent), so the name stays unbound: a tag or a registered call
                // reaches the registry by name, `new` needs only the identifier,
                // and a chain rooted here symbolises inside an interior.
                unresolved.insert(imp.local.clone(), format!("{} is a host package, which binds no value in data-host", imp.specifier));
            } else {
                unresolved.insert(imp.local.clone(), format!("{} is not a package the host owns", imp.specifier));
            }
        }
        // The scope a project-local function folds in is its defining module's (F-Eval-CallLocal step 4).
        let shared = Rc::new(scope.clone());
        for f in &m.functions { self.fn_scopes.insert(format!("{}::{}", path, f.name), shared.clone()); }
        let ctx = Ctx { host: self.host, fn_scopes: self.fn_scopes.clone() };
        // F-Prebuild: every top-level `const n = new T(…)` in source order; a failure leaves the name absent.
        for (name, e, is_new) in &m.consts {
            if !*is_new { continue; }
            if let Ok(v) = eval::eval(e, &scope, &ctx) { scope.externals.insert(name.clone(), v); }
        }
        // Functions bound after prebuild see the same scope (their consts map is the module's).
        let shared = Rc::new(scope.clone());
        for f in &m.functions { self.fn_scopes.insert(format!("{}::{}", path, f.name), shared.clone()); }
        let ctx = Ctx { host: self.host, fn_scopes: self.fn_scopes.clone() };
        // F-Declarator, F-Total.
        let mut exports: Vec<(String, V)> = vec![];
        let set = |exports: &mut Vec<(String, V)>, k: String, v: V| { if let Some(s) = exports.iter_mut().find(|(key, _)| *key == k) { s.1 = v; } else { exports.push((k, v)); } };
        for d in &m.declarators {
            match d {
                Declarator::Resource { name, expr } | Declarator::Single { name, expr } => {
                    let v = match scope.externals.get(name) { Some(v) if matches!(scope.consts.get(name), Some((_, true))) => v.clone(), _ => eval::eval(expr, &scope, &ctx).map_err(|r| anchor(r, name))? };
                    set(&mut exports, name.clone(), v);
                }
                Declarator::Default(expr) => { let v = eval::eval(expr, &scope, &ctx).map_err(|r| anchor(r, "default"))?; set(&mut exports, "default".into(), v); }
                Declarator::Destructure { expr, elements, loc } => {
                    let v = eval::eval(expr, &scope, &ctx)?;
                    let V::Obj(o) = &v else { return Err(Reject { rule: "F-Declarator", loc: *loc, message: "a destructured export needs an indexable object".into() }) };
                    for (key, local) in elements { set(&mut exports, local.clone(), o.get(key).cloned().unwrap_or(V::Undefined)); }
                }
                Declarator::Named(elements) => {
                    for (local, exported, loc) in elements {
                        let v = resolve_name(local, *loc, &scope, &ctx, &unresolved)?;
                        set(&mut exports, exported.clone(), v);
                    }
                }
                Declarator::ReExport { specifier, elements, loc } => {
                    if !is_project(specifier) { return Err(Reject { rule: "F-Import", loc: *loc, message: format!("a re-export from {} is not resolved", specifier) }); }
                    let Some(target) = resolve(path, specifier, &self.files) else { return Err(Reject { rule: "F-Import", loc: *loc, message: format!("{} does not resolve to a file of the project", specifier) }) };
                    let ctx_unused = &ctx; let _ = ctx_unused;
                    match self.fold_file(&target) {
                        Verdict::Fold(x) => for (imported, exported) in elements {
                            let Some((_, v)) = x.iter().find(|(k, _)| k == imported) else { return Err(Reject { rule: "F-Import", loc: *loc, message: format!("{} exports no `{}`", target, imported) }) };
                            set(&mut exports, exported.clone(), v.clone());
                        },
                        Verdict::Run { reason, .. } => return Err(Reject { rule: "F-Import", loc: *loc, message: format!("{} does not fold: {}", target, reason) }),
                    }
                }
                Declarator::Function(name) => { if let Some(f) = m.functions.iter().find(|f| &f.name == name) { set(&mut exports, name.clone(), V::Func(f.clone())); } }
            }
        }
        Ok(exports)
    }
}

/// A named export resolves through `locals` then `externals`, by F-Eval-Ident and not by re-folding (F-Declarator).
fn resolve_name(local: &str, loc: Loc, scope: &Scope, ctx: &Ctx, unresolved: &HashMap<String, String>) -> Result<V, Reject> {
    if let Some((e, is_new)) = scope.consts.get(local) {
        if *is_new { return scope.externals.get(local).cloned().ok_or(Reject { rule: "F-Div-SameFileNew", loc, message: format!("`{}` is bound to a construction that did not fold", local) }); }
        return eval::eval(e, scope, ctx);
    }
    if let Some(v) = scope.externals.get(local) { return Ok(v.clone()); }
    if let Some(why) = unresolved.get(local) { return Err(Reject { rule: "F-Reference", loc, message: format!("unresolved identifier: {} ({})", local, why) }); }
    Err(Reject { rule: "F-Reference", loc, message: format!("unresolved identifier: {}", local) })
}

fn anchor(r: Reject, name: &str) -> Reject {
    Reject { rule: r.rule, loc: r.loc, message: format!("{}: {}", name, r.message) }
}

pub fn is_project(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../")
}

/// A project specifier joined to the importer's directory, with or without `.ts`.
pub fn resolve(from: &str, specifier: &str, files: &HashMap<String, String>) -> Option<String> {
    let dir: Vec<&str> = from.rsplit_once('/').map(|(d, _)| d.split('/').collect()).unwrap_or_default();
    let mut parts: Vec<String> = dir.iter().map(|s| s.to_string()).collect();
    for seg in specifier.split('/') {
        match seg {
            "." | "" => {}
            ".." => { parts.pop(); }
            s => parts.push(s.to_string()),
        }
    }
    let joined = parts.join("/");
    let candidates = [joined.clone(), format!("{}.ts", joined), format!("{}/index.ts", joined)];
    candidates.into_iter().find(|c| files.contains_key(c))
}

/// Every path of the project that is reachable: used by the expression entry to build a one-file project.
pub fn _paths(files: &HashMap<String, String>) -> HashSet<String> { files.keys().cloned().collect() }
