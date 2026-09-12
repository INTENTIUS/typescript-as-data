//! J1, expression evaluation `Γ, H ⊢ e ⇓ v` (judgments.md), in the data-host
//! profile: helpers and eager calls are absent, `new` folds to an envelope,
//! and no fate ever runs. Also the shape classifier over the same tree
//! (grammar.md §2).
use std::collections::HashMap;
use std::rc::Rc;

use crate::ast::{Binding, Element, Expr, FnBody, FnDecl, Loc, Member, Param, UnaryOp};
use crate::js;
use crate::value::{Obj, V};

#[derive(Clone, Debug, serde::Deserialize, Default)]
pub struct Intrinsic {
    pub name: String,
    #[serde(default, rename = "isTag")]
    pub is_tag: bool,
    #[serde(default, rename = "foldsAsCall")]
    pub folds_as_call: bool,
    #[serde(default, rename = "foldsEagerly")]
    pub folds_eagerly: bool,
}

#[derive(Clone, Debug, serde::Deserialize, Default)]
pub struct Host {
    #[serde(default)]
    pub intrinsics: Vec<Intrinsic>,
    #[serde(default, rename = "ownedSpecifierPrefixes")]
    pub owned_specifier_prefixes: Vec<String>,
}

impl Host {
    pub fn tag(&self, n: &str) -> bool { self.intrinsics.iter().any(|i| i.name == n && i.is_tag) }
    pub fn call(&self, n: &str) -> bool { self.intrinsics.iter().any(|i| i.name == n && !i.is_tag && i.folds_as_call) }
    pub fn eager(&self, n: &str) -> bool { self.intrinsics.iter().any(|i| i.name == n && !i.is_tag && i.folds_eagerly) }
    pub fn owns(&self, specifier: &str) -> bool { self.owned_specifier_prefixes.iter().any(|p| specifier.starts_with(p.as_str())) }
}

/// A located rejection (R9.3), carrying the rule it fell under.
#[derive(Clone, Debug)]
pub struct Reject {
    pub rule: &'static str,
    pub loc: Loc,
    pub message: String,
}
pub type R<T> = Result<T, Reject>;
fn reject<T>(rule: &'static str, loc: Loc, message: impl Into<String>) -> R<T> {
    Err(Reject { rule, loc, message: message.into() })
}

/// `Γ`: `consts` are the top-level constants by name with whether each is a
/// `new` (F-Eval-Ident step 1, F-Eval-Member step 1); `externals` is every
/// other binding, imports and functions and the envelopes F-Prebuild built.
#[derive(Clone)]
pub struct Scope {
    pub consts: HashMap<String, (Expr, bool)>,
    pub externals: HashMap<String, V>,
    pub depth: u32,
}

pub const MAX_CALL_DEPTH: u32 = 32;

pub struct Ctx<'h> {
    pub host: &'h Host,
    /// The scope each project-local function folds in (F-Eval-CallLocal step 4): its defining module's.
    pub fn_scopes: HashMap<String, Rc<Scope>>,
}

/// The top of an expression: a chain sentinel that reaches here is `undefined`.
pub fn eval(e: &Expr, s: &Scope, c: &Ctx) -> R<V> {
    Ok(match eval_raw(e, s, c)? { V::Chain => V::Undefined, v => v })
}

fn eval_raw(e: &Expr, s: &Scope, c: &Ctx) -> R<V> {
    match e {
        Expr::Reject { loc, rule, message } => reject(rule, *loc, message.clone()),
        Expr::Undefined(_) => Ok(V::Undefined),
        Expr::Null(_) => Ok(V::Null),
        Expr::Bool(b, _) => Ok(V::Bool(*b)),
        Expr::Num(n, _) => Ok(V::Num(*n)),
        Expr::Str(t, _) => Ok(V::Str(t.clone())),
        Expr::NonNull(inner) => eval_raw(inner, s, c),
        Expr::Ident(n, loc) => ident(n, *loc, s, c),
        Expr::Template { quasis, spans, .. } => {
            let mut out = String::new();
            for (i, q) in quasis.iter().enumerate() {
                out.push_str(q);
                if i < spans.len() {
                    let v = eval(&spans[i], s, c)?;
                    if v.is_envelope() { return reject("F-Eval-Template", spans[i].loc(), "a symbolic value has no string form until the build resolves it"); }
                    if v.is_callable() { return reject("F-Eval-Template", spans[i].loc(), "a function has no string form"); }
                    out.push_str(&js::to_string(&v));
                }
            }
            Ok(V::Str(out))
        }
        Expr::Tagged { tag, quasis, spans, loc } => {
            if s.depth > 0 { return reject("F-Eval-Tagged", *loc, "a tagged template inside a folded function body is not foldable"); }
            if !c.host.tag(tag) { return reject("F-Div-Tag", *loc, format!("`{}` is not a registered tag", tag)); }
            let values = spans.iter().map(|x| interior(x, s, c)).collect::<R<Vec<_>>>()?;
            Ok(V::obj(vec![("__intrinsic", V::str(tag)), ("strings", V::Arr(quasis.iter().map(|q| V::Str(q.clone())).collect())), ("values", V::Arr(values))]))
        }
        Expr::Object(members, _) => {
            let mut o = Obj::default();
            for m in members {
                match m {
                    Member::Prop(k, x) => { let v = eval(x, s, c)?; o.set(k.clone(), v); }
                    Member::Shorthand(n, loc) => { let v = ident(n, *loc, s, c)?; o.set(n.clone(), v); }
                    Member::Spread(x, loc) => match eval(x, s, c)? {
                        V::Obj(src) | V::Namespace(src) => { for (k, v) in src.0 { o.set(k, v); } }
                        V::Arr(a) => { for (i, v) in a.into_iter().enumerate() { o.set(i.to_string(), v); } }
                        _ => return reject("F-Eval-Object", *loc, "spread of a non-object is not foldable"),
                    },
                }
            }
            Ok(V::Obj(o))
        }
        Expr::Array(elements, _) => {
            let mut out = vec![];
            for el in elements {
                match el {
                    Element::Plain(x) => out.push(eval(x, s, c)?),
                    Element::Spread(x, loc) => match eval(x, s, c)? {
                        V::Arr(a) => out.extend(a),
                        _ => return reject("F-Eval-Array", *loc, "spread of a non-array is not foldable"),
                    },
                }
            }
            Ok(V::Arr(out))
        }
        Expr::Member { obj, prop, optional, loc } => member(obj, prop, *optional, *loc, s, c),
        Expr::Index { obj, key, optional, loc } => member(obj, key, *optional, *loc, s, c),
        Expr::Unary { op, operand, .. } => {
            let v = eval(operand, s, c)?;
            Ok(match op { UnaryOp::Not => V::Bool(!js::truthy(&v)), UnaryOp::Neg => V::Num(-js::to_number(&v)) })
        }
        Expr::Binary { op, left, right, loc } => {
            let l = eval(left, s, c)?;
            match op.as_str() {
                "&&" => return if js::truthy(&l) { eval(right, s, c) } else { Ok(l) },
                "||" => return if js::truthy(&l) { Ok(l) } else { eval(right, s, c) },
                "??" => return if js::nullish(&l) { eval(right, s, c) } else { Ok(l) },
                _ => {}
            }
            let r = eval(right, s, c)?;
            if l.is_envelope() || r.is_envelope() { return reject("F-Eval-Binary", *loc, "an operator on a symbolic value is not foldable"); }
            Ok(match op.as_str() {
                "+" => js::plus(&l, &r),
                "-" => V::Num(js::to_number(&l) - js::to_number(&r)),
                "*" => V::Num(js::to_number(&l) * js::to_number(&r)),
                "/" => V::Num(js::to_number(&l) / js::to_number(&r)),
                "===" => V::Bool(js::strict_equal(&l, &r)),
                "!==" => V::Bool(!js::strict_equal(&l, &r)),
                "<" => V::Bool(js::less_than(&l, &r) == Some(true)),
                ">" => V::Bool(js::less_than(&r, &l) == Some(true)),
                "<=" => V::Bool(js::less_than(&r, &l) == Some(false)),
                ">=" => V::Bool(js::less_than(&l, &r) == Some(false)),
                other => return reject("F-Eval-Binary", *loc, format!("operator {} is not foldable", other)),
            })
        }
        Expr::Conditional { test, then, els, .. } => {
            if js::truthy(&eval(test, s, c)?) { eval(then, s, c) } else { eval(els, s, c) }
        }
        Expr::New { callee, callee_loc, args, loc } => {
            let Some(cls) = callee else { return reject("F-Div-NsNew", *callee_loc, "the class of a `new` must be a plain identifier") };
            if s.depth > 0 { return reject("F-Eval-New", *loc, "`new` inside a folded function body is not foldable"); }
            // F-Eval-New asks only that the class be a plain identifier; in data-host
            // the name is what the serializer maps (F-Profile-DataHost).
            let _ = callee_loc;
            let mut folded = vec![];
            for a in args {
                match a {
                    Element::Plain(x) => folded.push(eval(x, s, c)?),
                    Element::Spread(_, l) => return reject("F-Eval-New", *l, "a spread argument to `new` is not foldable"),
                }
            }
            let is_obj_lit = |i: usize| matches!(args.get(i), Some(Element::Plain(Expr::Object(..))));
            let mut o = vec![("__resource", V::str(cls))];
            if folded.is_empty() {
                o.push(("props", V::Obj(Obj::default())));
            } else if folded.len() == 1 && is_obj_lit(0) {
                o.push(("props", folded[0].clone()));
            } else if folded.len() == 2 && is_obj_lit(0) && is_obj_lit(1) {
                o.push(("props", folded[0].clone()));
                o.push(("attributes", folded[1].clone()));
            } else {
                let props = (0..folded.len()).find(|i| is_obj_lit(*i)).map(|i| folded[i].clone()).unwrap_or(V::Obj(Obj::default()));
                o.push(("props", props));
                o.push(("args", V::Arr(folded)));
            }
            Ok(V::obj(o))
        }
        Expr::Call { callee, args, loc } => call(callee, args, *loc, s, c),
        Expr::MethodCall { obj, method, optional, args, loc } => {
            let x = eval_raw(obj, s, c)?;
            if matches!(x, V::Chain) { return Ok(V::Chain); }
            if js::nullish(&x) {
                if *optional { return Ok(V::Chain); }
                return reject("F-Eval-CallMethod", *loc, format!("method \"{}\" called on {} is not foldable", method, js::to_string(&x)));
            }
            if x.is_envelope() { return reject("F-Eval-CallMethod", *loc, format!("method \"{}\" on a symbolic value is not foldable", method)); }
            let argv = args.iter().map(|a| match a { Element::Plain(e) => eval(e, s, c), Element::Spread(_, l) => reject("F-Eval-CallMethod", *l, "a spread argument is not foldable") }).collect::<R<Vec<_>>>()?;
            crate::methods::call_method(&x, method, &argv).ok_or_else(|| Reject { rule: "F-Eval-CallMethod", loc: *loc, message: format!("\"{}\" is not a method of this value", method) })
        }
    }
}

/// F-Eval-Ident, in order.
fn ident(n: &str, loc: Loc, s: &Scope, c: &Ctx) -> R<V> {
    if let Some((init, is_new)) = s.consts.get(n) {
        if *is_new {
            return match s.externals.get(n) {
                Some(v) => Ok(v.clone()),
                None => reject("F-Div-SameFileNew", loc, format!("`{}` is bound to a construction that did not fold", n)),
            };
        }
        return eval(init, s, c);
    }
    if let Some(v) = s.externals.get(n) {
        if v.is_callable() { return reject("F-Eval-Ident", loc, format!("function \"{}\" used as a value is not foldable", n)); }
        return Ok(v.clone());
    }
    if n == "process" { return reject("F-Eval-Ident", loc, "`process` is not foldable: build parameters are an input to folding"); }
    reject("F-Reference", loc, format!("unresolved identifier: {}", n))
}

/// F-Eval-Interior: an unresolved chain inside an intrinsic is a symbol.
fn interior(e: &Expr, s: &Scope, c: &Ctx) -> R<V> {
    if let Some(text) = unresolved_chain(e, s) { return Ok(V::obj(vec![("__symbol", V::Str(text))])); }
    eval(e, s, c)
}
fn unresolved_chain(e: &Expr, s: &Scope) -> Option<String> {
    match e {
        Expr::Ident(n, _) => if s.consts.contains_key(n) || s.externals.contains_key(n) { None } else { Some(n.clone()) },
        Expr::Member { obj, prop, .. } => unresolved_chain(obj, s).map(|t| format!("{}.{}", t, prop)),
        Expr::Index { obj, key, .. } => unresolved_chain(obj, s).map(|t| format!("{}[\"{}\"]", t, key)),
        Expr::NonNull(inner) => unresolved_chain(inner, s).map(|t| format!("{}!", t)),
        _ => None,
    }
}

/// F-Eval-Member and F-Eval-Index.
fn member(obj: &Expr, key: &str, optional: bool, loc: Loc, s: &Scope, c: &Ctx) -> R<V> {
    // 1. an attribute of a same-file construction is a reference by name
    if let Expr::Ident(n, _) = obj {
        if matches!(s.consts.get(n), Some((_, true))) {
            return Ok(attr_ref(n, key));
        }
    }
    // 2. `<unclaimed>(…).step`
    if key == "step" {
        if let Expr::Call { callee, args, loc: cl } = obj {
            if unclaimed(callee, s, c) {
                if s.depth > 0 { return reject("F-Eval-Member", *cl, "a composite step inside a folded function body is not foldable"); }
                let argv = args.iter().map(|a| match a { Element::Plain(e) => eval(e, s, c), Element::Spread(_, l) => reject("F-Eval-Member", *l, "a spread argument is not foldable") }).collect::<R<Vec<_>>>()?;
                return Ok(V::obj(vec![("__compositeStep", V::str(callee)), ("args", V::Arr(argv))]));
            }
        }
    }
    let x = eval_raw(obj, s, c)?;
    // 3. the chain sentinel propagates
    if matches!(x, V::Chain) { return Ok(V::Chain); }
    // 4. nullish
    if js::nullish(&x) {
        if optional { return Ok(V::Chain); }
        return reject("F-Div-Nullish", loc, format!("property \"{}\" read on {} is not foldable: running this expression throws. Write `?.` if the value is genuinely optional", key, js::to_string(&x)));
    }
    // 5. an attribute read on a construction used as a value
    if x.envelope_key() == Some("__resource") {
        if let Expr::Ident(n, _) = obj { return Ok(attr_ref(n, key)); }
        return reject("F-Eval-Member", loc, format!("attribute \"{}\" read on an inline construction has no name to reference it by", key));
    }
    if x.is_envelope() { return reject("F-Eval-Member", loc, format!("property \"{}\" read on a symbolic value is not foldable", key)); }
    // 6. a plain index
    Ok(match &x {
        V::Obj(o) | V::Namespace(o) => o.get(key).cloned().unwrap_or(V::Undefined),
        V::Arr(a) => {
            if key == "length" { V::Num(a.len() as f64) } else { key.parse::<usize>().ok().and_then(|i| a.get(i).cloned()).unwrap_or(V::Undefined) }
        }
        V::Str(t) => {
            if key == "length" { V::Num(t.encode_utf16().count() as f64) } else { key.parse::<usize>().ok().and_then(|i| t.encode_utf16().nth(i)).map(|u| V::Str(String::from_utf16_lossy(&[u]))).unwrap_or(V::Undefined) }
        }
        _ => V::Undefined,
    })
}

fn attr_ref(entity: &str, attribute: &str) -> V {
    V::obj(vec![("__attrRef", V::obj(vec![("entity", V::str(entity)), ("attribute", V::str(attribute))]))])
}

/// S-Unclaimed: a bare callee no other call form claims.
fn unclaimed(callee: &str, s: &Scope, c: &Ctx) -> bool {
    !s.consts.contains_key(callee) && !c.host.call(callee) && !c.host.eager(callee) && !matches!(s.externals.get(callee), Some(V::Func(_)))
}

/// The call forms, registered shapes first (F-Eval-CallIntrinsic, F-Eval-CallEager), then F-Eval-CallLocal.
fn call(callee: &str, args: &[Element], loc: Loc, s: &Scope, c: &Ctx) -> R<V> {
    if !s.consts.contains_key(callee) {
        if c.host.call(callee) {
            if s.depth > 0 { return reject("F-Eval-CallIntrinsic", loc, "an intrinsic call inside a folded function body is not foldable"); }
            let argv = args.iter().map(|a| match a { Element::Plain(e) => interior(e, s, c), Element::Spread(_, l) => reject("F-Eval-CallIntrinsic", *l, "a spread argument is not foldable") }).collect::<R<Vec<_>>>()?;
            return Ok(V::obj(vec![("__intrinsic", V::str(callee)), ("args", V::Arr(argv))]));
        }
        if c.host.eager(callee) {
            // F-Profile-DataHost: nothing to invoke, and the name is an ordinary unresolved identifier.
            return reject("F-Reference", loc, format!("unresolved identifier: {} (an eager intrinsic has nothing to invoke in data-host)", callee));
        }
    }
    if let Some(V::Func(f)) = s.externals.get(callee) {
        return call_local(f.clone(), args, loc, s, c);
    }
    reject("F-Eval-Reject", loc, format!("call to \"{}\" is not foldable: unsupported expression", callee))
}

/// F-Eval-CallLocal.
fn call_local(f: Rc<FnDecl>, args: &[Element], loc: Loc, s: &Scope, c: &Ctx) -> R<V> {
    if let Some(why) = &f.invalid {
        return reject("F-Eval-CallLocal", loc, format!("call to \"{}\" ({}) is not foldable: {}", f.name, f.file, why));
    }
    if s.depth >= MAX_CALL_DEPTH { return reject("F-Depth", loc, "call depth exceeded"); }
    let mut argv = vec![];
    for a in args {
        match a {
            Element::Plain(e) => argv.push(eval(e, s, c)?),
            Element::Spread(_, l) => return reject("F-Eval-CallLocal", *l, "a spread argument is not foldable"),
        }
    }
    let defining = c.fn_scopes.get(&format!("{}::{}", f.file, f.name)).cloned().expect("a scope per function");
    let mut inner = Scope { consts: defining.consts.clone(), externals: defining.externals.clone(), depth: s.depth + 1 };
    for (i, p) in f.params.iter().enumerate() {
        match p {
            Param::Ident { name, default } => {
                let v = match argv.get(i) {
                    Some(V::Undefined) | None => match default { Some(d) => eval(d, &inner, c)?, None => V::Undefined },
                    Some(v) => v.clone(),
                };
                inner.consts.remove(name);
                inner.externals.insert(name.clone(), v);
            }
            Param::Pattern(els) => {
                let v = argv.get(i).cloned().unwrap_or(V::Undefined);
                let V::Obj(o) = &v else { return reject("F-Eval-CallLocal", loc, format!("call to \"{}\": a destructured parameter needs an object", f.name)) };
                for (key, local) in els {
                    inner.consts.remove(local);
                    inner.externals.insert(local.clone(), o.get(key).cloned().unwrap_or(V::Undefined));
                }
            }
        }
    }
    let re = |r: Reject| Reject { rule: r.rule, loc, message: format!("call to \"{}\" ({}) is not foldable: {}:{}:{} - {}", f.name, f.file, f.file, r.loc.line, r.loc.column, r.message) };
    let result = match &f.body {
        FnBody::Expr(e) => eval(e, &inner, c).map_err(re)?,
        FnBody::Block { consts, ret } => {
            for (b, e) in consts {
                let v = eval(e, &inner, c).map_err(re)?;
                match b {
                    Binding::Ident(n) => { inner.consts.remove(n); inner.externals.insert(n.clone(), v); }
                    Binding::Pattern(els) => {
                        let V::Obj(o) = &v else { return reject("F-Eval-CallLocal", loc, format!("call to \"{}\": destructuring a non-object", f.name)) };
                        for (key, local) in els { inner.consts.remove(local); inner.externals.insert(local.clone(), o.get(key).cloned().unwrap_or(V::Undefined)); }
                    }
                }
            }
            match ret { Some(e) => eval(e, &inner, c).map_err(re)?, None => V::Undefined }
        }
    };
    if result.is_callable() { return reject("F-Val-Callable", loc, format!("call to \"{}\" returned a function, which is not a value", f.name)); }
    Ok(result)
}

// ── the shape classifier (grammar.md §2) ───────────────────────────────────

pub struct ShapeVerdict {
    pub rule: &'static str,
    pub loc: Loc,
    pub message: String,
}

/// `None` accepts. `local_callees` are the names S-CallLocal admits: bound by
/// S-LocalFunction or imported from a project specifier.
pub fn shape(e: &Expr, host: &Host, local_callees: &[String]) -> Option<ShapeVerdict> {
    let no = |rule: &'static str, loc: Loc, m: &str| Some(ShapeVerdict { rule, loc, message: m.to_string() });
    match e {
        Expr::Reject { loc, rule, message } => Some(ShapeVerdict { rule, loc: *loc, message: message.clone() }),
        Expr::Undefined(_) | Expr::Null(_) | Expr::Bool(..) | Expr::Num(..) | Expr::Str(..) | Expr::Ident(..) => None,
        Expr::NonNull(inner) => shape(inner, host, local_callees),
        Expr::Template { spans, .. } => spans.iter().find_map(|x| shape(x, host, local_callees)),
        // S-Tagged: the interior is opaque at shape level.
        Expr::Tagged { .. } => None,
        Expr::Object(members, _) => members.iter().find_map(|m| match m {
            Member::Prop(_, x) | Member::Spread(x, _) => shape(x, host, local_callees),
            Member::Shorthand(..) => None,
        }),
        Expr::Array(els, _) => els.iter().find_map(|el| match el { Element::Plain(x) | Element::Spread(x, _) => shape(x, host, local_callees) }),
        Expr::Member { obj, prop, .. } => {
            // S-CompositeStep takes precedence: any call, any arguments.
            if prop == "step" { if let Expr::Call { args, .. } = &**obj { return args.iter().find_map(|a| match a { Element::Plain(x) | Element::Spread(x, _) => shape(x, host, local_callees) }); } }
            shape(obj, host, local_callees)
        }
        Expr::Index { obj, .. } => shape(obj, host, local_callees),
        Expr::Unary { operand, .. } => shape(operand, host, local_callees),
        Expr::Binary { left, right, .. } => shape(left, host, local_callees).or_else(|| shape(right, host, local_callees)),
        Expr::Conditional { test, then, els, .. } => shape(test, host, local_callees).or_else(|| shape(then, host, local_callees)).or_else(|| shape(els, host, local_callees)),
        Expr::New { args, .. } => args.iter().find_map(|a| match a { Element::Plain(x) | Element::Spread(x, _) => shape(x, host, local_callees) }),
        Expr::Call { callee, args, loc } => {
            let admitted = host.call(callee) || host.eager(callee) || local_callees.iter().any(|n| n == callee);
            if !admitted { return no("S-Reject", *loc, &format!("call to \"{}\" is not a call form the subset admits", callee)); }
            args.iter().find_map(|a| match a { Element::Plain(x) | Element::Spread(x, _) => shape(x, host, local_callees) })
        }
        Expr::MethodCall { obj, args, .. } => shape(obj, host, local_callees).or_else(|| args.iter().find_map(|a| match a { Element::Plain(x) | Element::Spread(x, _) => shape(x, host, local_callees) })),
    }
}
