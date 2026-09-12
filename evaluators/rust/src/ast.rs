//! An owned expression tree over the grammar's productions (grammar.md §2),
//! converted once from oxc's arena AST so no lifetime crosses a file. The
//! conversion is where the shape classifier lives: a construct outside the
//! subset becomes `Expr::Reject` with its location and rule, which is what
//! S-Reject and F-Eval-Reject both need.
use oxc_allocator::Allocator;
use oxc_ast::ast::{self, Expression, PropertyKey, Statement};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};
use std::rc::Rc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct Loc {
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Debug)]
pub enum Expr {
    Undefined(Loc),
    Null(Loc),
    Bool(bool, Loc),
    Num(f64, Loc),
    Str(String, Loc),
    Ident(String, Loc),
    Template { quasis: Vec<String>, spans: Vec<Expr>, loc: Loc },
    Tagged { tag: String, quasis: Vec<String>, spans: Vec<Expr>, loc: Loc },
    Object(Vec<Member>, Loc),
    Array(Vec<Element>, Loc),
    Member { obj: Box<Expr>, prop: String, optional: bool, loc: Loc },
    /// `o[k]` with a literal key, or `Reject` when the key is not one (S-Index).
    Index { obj: Box<Expr>, key: String, optional: bool, loc: Loc },
    Unary { op: UnaryOp, operand: Box<Expr>, loc: Loc },
    Binary { op: String, left: Box<Expr>, right: Box<Expr>, loc: Loc },
    Conditional { test: Box<Expr>, then: Box<Expr>, els: Box<Expr>, loc: Loc },
    /// `new C(args)`; `callee` is the identifier or `None` when it is not one (F-Div-NsNew).
    New { callee: Option<String>, callee_loc: Loc, args: Vec<Element>, loc: Loc },
    /// `f(args)` with a bare identifier callee (S-CallHelper, S-CallIntrinsic, S-CallEager, S-CallLocal, S-Unclaimed).
    Call { callee: String, args: Vec<Element>, loc: Loc },
    /// `o.m(args)` (S-CallMethod).
    MethodCall { obj: Box<Expr>, method: String, optional: bool, args: Vec<Element>, loc: Loc },
    /// A `!` that continues an optional chain (F-Eval-Unwrap).
    NonNull(Box<Expr>),
    /// Outside the subset: the location, the S-* or F-* rule, and why.
    Reject { loc: Loc, rule: &'static str, message: String },
}

#[derive(Clone, Copy, Debug)]
pub enum UnaryOp {
    Not,
    Neg,
}

#[derive(Clone, Debug)]
pub enum Member {
    Prop(String, Expr),
    Shorthand(String, Loc),
    Spread(Expr, Loc),
}

#[derive(Clone, Debug)]
pub enum Element {
    Plain(Expr),
    Spread(Expr, Loc),
}

impl Expr {
    pub fn loc(&self) -> Loc {
        match self {
            Expr::Undefined(l) | Expr::Null(l) | Expr::Bool(_, l) | Expr::Num(_, l) | Expr::Str(_, l) | Expr::Ident(_, l) => *l,
            Expr::Template { loc, .. } | Expr::Tagged { loc, .. } | Expr::Object(_, loc) | Expr::Array(_, loc) => *loc,
            Expr::Member { loc, .. } | Expr::Index { loc, .. } | Expr::Unary { loc, .. } | Expr::Binary { loc, .. } => *loc,
            Expr::Conditional { loc, .. } | Expr::New { loc, .. } | Expr::Call { loc, .. } | Expr::MethodCall { loc, .. } => *loc,
            Expr::NonNull(e) => e.loc(),
            Expr::Reject { loc, .. } => *loc,
        }
    }
}

/// A project-local function (S-LocalFunction, S-FnBody), kept with the
/// scope it was declared in so a call folds in the defining module's `Γ`.
#[derive(Debug)]
pub struct FnDecl {
    pub name: String,
    pub file: String,
    pub params: Vec<Param>,
    pub body: FnBody,
    pub loc: Loc,
    /// Why S-FnBody refuses this declaration, decided once (F-Eval-CallLocal step 1).
    pub invalid: Option<String>,
}

#[derive(Debug, Clone)]
pub enum Param {
    Ident { name: String, default: Option<Expr> },
    Pattern(Vec<(String, String)>),
}

#[derive(Debug)]
pub enum FnBody {
    Expr(Expr),
    Block { consts: Vec<(Binding, Expr)>, ret: Option<Expr> },
}

#[derive(Debug, Clone)]
pub enum Binding {
    Ident(String),
    Pattern(Vec<(String, String)>),
}

/// One import binding (F-Import).
#[derive(Debug, Clone)]
pub struct Import {
    pub local: String,
    pub specifier: String,
    pub kind: ImportKind,
}
#[derive(Debug, Clone)]
pub enum ImportKind {
    Named(String),
    Default,
    Namespace,
}

/// An admitted declarator, in source order (F-Scan).
#[derive(Debug)]
pub enum Declarator {
    Resource { name: String, expr: Expr },
    Single { name: String, expr: Expr },
    Destructure { expr: Expr, elements: Vec<(String, String)>, loc: Loc },
    Named(Vec<(String, String, Loc)>),
    ReExport { specifier: String, elements: Vec<(String, String)>, loc: Loc },
    Function(String),
    Default(Expr),
}

#[derive(Debug)]
pub struct Module {
    pub imports: Vec<Import>,
    /// Every top-level `const n = e` with an identifier and an initializer that is not a function (F-Bind).
    pub consts: Vec<(String, Expr, bool)>,
    pub functions: Vec<Rc<FnDecl>>,
    pub declarators: Vec<Declarator>,
    /// S-Disqualify: the construct, located.
    pub disqualified: Option<(Loc, String)>,
}

pub struct Source {
    line_starts: Vec<u32>,
}
impl Source {
    pub fn new(text: &str) -> Source {
        let mut line_starts = vec![0u32];
        for (i, b) in text.bytes().enumerate() {
            if b == b'\n' { line_starts.push(i as u32 + 1); }
        }
        Source { line_starts }
    }
    pub fn loc(&self, span: Span) -> Loc {
        let off = span.start;
        let line = match self.line_starts.binary_search(&off) { Ok(i) => i, Err(i) => i - 1 };
        Loc { line: line as u32 + 1, column: off - self.line_starts[line] + 1 }
    }
}

pub fn parse_module(file: &str, text: &str, admit_default: bool) -> Result<Module, String> {
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, text, SourceType::ts()).parse();
    if let Some(e) = ret.diagnostics.first() {
        return Err(format!("parse error: {}", e));
    }
    let src = Source::new(text);
    let c = Conv { src: &src, text, file };
    let mut m = Module { imports: vec![], consts: vec![], functions: vec![], declarators: vec![], disqualified: None };
    for st in &ret.program.body {
        if m.disqualified.is_some() { break; }
        c.statement(st, admit_default, &mut m);
    }
    Ok(m)
}

struct Conv<'s> {
    src: &'s Source,
    text: &'s str,
    file: &'s str,
}

impl<'s> Conv<'s> {
    fn loc(&self, span: Span) -> Loc {
        self.src.loc(span)
    }
    fn text_of(&self, span: Span) -> String {
        self.text[span.start as usize..span.end as usize].to_string()
    }

    fn statement(&self, st: &Statement, admit_default: bool, m: &mut Module) {
        match st {
            Statement::ImportDeclaration(d) => {
                if d.import_kind.is_type() { return; }
                let specifier = d.source.value.to_string();
                if let Some(specs) = &d.specifiers {
                    for s in specs.iter() {
                        match s {
                            ast::ImportDeclarationSpecifier::ImportSpecifier(x) => {
                                if x.import_kind.is_type() { continue; }
                                m.imports.push(Import { local: x.local.name.to_string(), specifier: specifier.clone(), kind: ImportKind::Named(x.imported.name().to_string()) });
                            }
                            ast::ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => {
                                m.imports.push(Import { local: x.local.name.to_string(), specifier: specifier.clone(), kind: ImportKind::Default });
                            }
                            ast::ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => {
                                m.imports.push(Import { local: x.local.name.to_string(), specifier: specifier.clone(), kind: ImportKind::Namespace });
                            }
                        }
                    }
                }
            }
            Statement::ExportAllDeclaration(d) => {
                if d.export_kind.is_type() { return; }
                m.disqualified = Some((self.loc(d.span), "`export * from` is not foldable".into()));
            }
            Statement::ExportDefaultDeclaration(d) => {
                match &d.declaration {
                    ast::ExportDefaultDeclarationKind::FunctionDeclaration(_) => {
                        m.disqualified = Some((self.loc(d.span), "`export default function` is not foldable".into()));
                    }
                    ast::ExportDefaultDeclarationKind::ClassDeclaration(_) | ast::ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => {
                        m.disqualified = Some((self.loc(d.span), "`export default` is not foldable".into()));
                    }
                    other => {
                        if !admit_default {
                            m.disqualified = Some((self.loc(d.span), "`export default` is not foldable".into()));
                            return;
                        }
                        let e = other.to_expression();
                        m.declarators.push(Declarator::Default(self.expr(e)));
                    }
                }
            }
            Statement::ExportDeclaration(d) => {
                self.declaration(&d.declaration, true, m, self.loc(d.span));
            }
            Statement::ExportNamedDeclaration(d) => {
                if d.export_kind.is_type() { return; }
                let elements: Vec<(String, String, Loc)> = d.specifiers.iter().filter(|s| !s.export_kind.is_type())
                    .map(|s| (s.local.name().to_string(), s.exported.name().to_string(), self.loc(s.span))).collect();
                m.declarators.push(Declarator::Named(elements));
            }
            Statement::ExportFromDeclaration(d) => {
                if d.export_kind.is_type() { return; }
                let elements: Vec<(String, String)> = d.specifiers.iter().filter(|s| !s.export_kind.is_type())
                    .map(|s| (s.local.name().to_string(), s.exported.name().to_string())).collect();
                m.declarators.push(Declarator::ReExport { specifier: d.source.value.to_string(), elements, loc: self.loc(d.span) });
            }
            Statement::VariableDeclaration(v) => self.variable(v, false, m, self.loc(v.span)),
            Statement::FunctionDeclaration(f) => {
                if let Some(fd) = self.function(f, m) { m.functions.push(fd); }
            }
            // S-Module: every other statement is invisible to the gate.
            _ => {}
        }
    }

    fn declaration(&self, decl: &ast::Declaration, exported: bool, m: &mut Module, loc: Loc) {
        match decl {
            ast::Declaration::VariableDeclaration(v) => self.variable(v, exported, m, loc),
            ast::Declaration::FunctionDeclaration(f) => {
                if let Some(fd) = self.function(f, m) {
                    let name = fd.name.clone();
                    m.functions.push(fd);
                    if exported { m.declarators.push(Declarator::Function(name)); }
                }
            }
            ast::Declaration::ClassDeclaration(_) => {
                if exported { m.disqualified = Some((loc, "an exported class is not foldable".into())); }
            }
            _ => {}
        }
    }

    fn variable(&self, v: &ast::VariableDeclaration, exported: bool, m: &mut Module, loc: Loc) {
        if v.kind != ast::VariableDeclarationKind::Const {
            if exported { m.disqualified = Some((loc, "an exported `let`/`var` is not foldable".into())); }
            return;
        }
        for d in &v.declarations {
            match &d.id {
                ast::BindingPattern::BindingIdentifier(id) => {
                    let name = id.name.to_string();
                    let Some(init) = &d.init else {
                        if exported { m.disqualified = Some((loc, "an exported uninitialized declaration is not foldable".into())); }
                        continue;
                    };
                    if let Some(fd) = self.function_expr(&name, init, m) {
                        m.functions.push(fd);
                        if exported { m.declarators.push(Declarator::Function(name)); }
                        continue;
                    }
                    let e = self.expr(init);
                    let is_new = matches!(init.without_parentheses(), Expression::NewExpression(_));
                    m.consts.push((name.clone(), e.clone(), is_new));
                    if exported {
                        m.declarators.push(if is_new { Declarator::Resource { name, expr: e } } else { Declarator::Single { name, expr: e } });
                    }
                }
                ast::BindingPattern::ObjectPattern(p) => {
                    if !exported { continue; } // S-TopConst: a destructured const is not a binding
                    let Some(init) = &d.init else {
                        m.disqualified = Some((loc, "an exported uninitialized declaration is not foldable".into()));
                        continue;
                    };
                    match self.plain_pattern(p) {
                        Some(elements) => m.declarators.push(Declarator::Destructure { expr: self.expr(init), elements, loc }),
                        None => m.disqualified = Some((loc, "an exported destructured declaration with a rest, default, or nested element is not foldable".into())),
                    }
                }
                _ => {
                    if exported { m.disqualified = Some((loc, "an exported array-destructured declaration is not foldable".into())); }
                }
            }
        }
    }

    /// `{ a, b: c }` with plain elements only; `None` otherwise (S-Disqualify, S-FnParams).
    fn plain_pattern(&self, p: &ast::ObjectPattern) -> Option<Vec<(String, String)>> {
        if p.rest.is_some() { return None; }
        let mut out = vec![];
        for el in &p.properties {
            let key = match &el.key {
                PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                PropertyKey::StringLiteral(s) => s.value.to_string(),
                _ => return None,
            };
            let ast::BindingPattern::BindingIdentifier(id) = &el.value else { return None };
            out.push((key, id.name.to_string()));
        }
        Some(out)
    }

    fn function(&self, f: &ast::Function, _m: &Module) -> Option<Rc<FnDecl>> {
        let name = f.id.as_ref()?.name.to_string();
        let loc = self.loc(f.span);
        let mut invalid = None;
        if f.r#async { invalid = Some("an async function is not foldable".into()); }
        if f.generator { invalid = Some("a generator is not foldable".into()); }
        let params = self.params(&f.params, &mut invalid);
        let body = match &f.body {
            Some(b) => self.block_body(&b.statements, &mut invalid),
            None => { invalid = Some("a function without a body is not foldable".into()); FnBody::Block { consts: vec![], ret: None } }
        };
        Some(Rc::new(FnDecl { name, file: self.file.to_string(), params, body, loc, invalid }))
    }

    /// `const n = (…) => …` or `= function …` (S-LocalFunction).
    fn function_expr(&self, name: &str, init: &Expression, _m: &Module) -> Option<Rc<FnDecl>> {
        match init.without_parentheses() {
            Expression::ArrowFunctionExpression(a) => {
                let loc = self.loc(a.span);
                let mut invalid = None;
                if a.r#async { invalid = Some("an async function is not foldable".into()); }
                let params = self.params(&a.params, &mut invalid);
                let body = match &a.body {
                    ast::ArrowFunctionBody::FunctionBody(b) => self.block_body(&b.statements, &mut invalid),
                    other => FnBody::Expr(self.expr(other.to_expression())),
                };
                Some(Rc::new(FnDecl { name: name.to_string(), file: self.file.to_string(), params, body, loc, invalid }))
            }
            Expression::FunctionExpression(f) => {
                let loc = self.loc(f.span);
                let mut invalid = None;
                if f.r#async { invalid = Some("an async function is not foldable".into()); }
                if f.generator { invalid = Some("a generator is not foldable".into()); }
                let params = self.params(&f.params, &mut invalid);
                let body = match &f.body {
                    Some(b) => self.block_body(&b.statements, &mut invalid),
                    None => FnBody::Block { consts: vec![], ret: None },
                };
                Some(Rc::new(FnDecl { name: name.to_string(), file: self.file.to_string(), params, body, loc, invalid }))
            }
            _ => None,
        }
    }

    fn params(&self, ps: &ast::FormalParameters, invalid: &mut Option<String>) -> Vec<Param> {
        if ps.rest.is_some() { *invalid = Some("a rest parameter is not foldable".into()); }
        let mut out = vec![];
        for p in &ps.items {
            match &p.pattern {
                ast::BindingPattern::BindingIdentifier(id) => out.push(Param::Ident { name: id.name.to_string(), default: None }),
                ast::BindingPattern::AssignmentPattern(a) => match &a.left {
                    ast::BindingPattern::BindingIdentifier(id) => out.push(Param::Ident { name: id.name.to_string(), default: Some(self.expr(&a.right)) }),
                    _ => *invalid = Some("a parameter pattern with a default is not foldable".into()),
                },
                ast::BindingPattern::ObjectPattern(op) => match self.plain_pattern(op) {
                    Some(els) => out.push(Param::Pattern(els)),
                    None => *invalid = Some("a parameter pattern with a rest, default, or nested element is not foldable".into()),
                },
                _ => *invalid = Some("an array-pattern parameter is not foldable".into()),
            }
        }
        out
    }

    /// S-FnBody's block form: `const` declarations then at most one final `return`.
    fn block_body(&self, sts: &[Statement], invalid: &mut Option<String>) -> FnBody {
        let mut consts = vec![];
        let mut ret = None;
        for (i, st) in sts.iter().enumerate() {
            match st {
                Statement::VariableDeclaration(v) if v.kind == ast::VariableDeclarationKind::Const => {
                    for d in &v.declarations {
                        let Some(init) = &d.init else { *invalid = Some("an uninitialized const in a function body is not foldable".into()); continue };
                        match &d.id {
                            ast::BindingPattern::BindingIdentifier(id) => consts.push((Binding::Ident(id.name.to_string()), self.expr(init))),
                            ast::BindingPattern::ObjectPattern(p) => match self.plain_pattern(p) {
                                Some(els) => consts.push((Binding::Pattern(els), self.expr(init))),
                                None => *invalid = Some("a destructuring const with a rest, default, or nested element is not foldable".into()),
                            },
                            _ => *invalid = Some("an array-destructuring const in a function body is not foldable".into()),
                        }
                    }
                }
                Statement::ReturnStatement(r) => {
                    if i != sts.len() - 1 { *invalid = Some("an early return is not foldable".into()); }
                    ret = r.argument.as_ref().map(|e| self.expr(e));
                }
                _ => *invalid = Some("a statement other than const or return in a function body is not foldable".into()),
            }
        }
        FnBody::Block { consts, ret }
    }

    pub fn expr(&self, e: &Expression) -> Expr {
        let loc = self.loc(e.span());
        match e {
            Expression::ParenthesizedExpression(p) => self.expr(&p.expression),
            Expression::TSAsExpression(x) => self.expr(&x.expression),
            Expression::TSSatisfiesExpression(x) => self.expr(&x.expression),
            Expression::TSNonNullExpression(x) => Expr::NonNull(Box::new(self.expr(&x.expression))),
            Expression::TSTypeAssertion(x) => self.expr(&x.expression),
            Expression::BooleanLiteral(b) => Expr::Bool(b.value, loc),
            Expression::NullLiteral(_) => Expr::Null(loc),
            Expression::NumericLiteral(n) => Expr::Num(n.value, loc),
            Expression::StringLiteral(s) => Expr::Str(s.value.to_string(), loc),
            Expression::Identifier(id) => {
                if id.name == "undefined" { Expr::Undefined(loc) } else { Expr::Ident(id.name.to_string(), loc) }
            }
            Expression::TemplateLiteral(t) => {
                let quasis: Vec<String> = t.quasis.iter().map(|q| q.value.cooked.as_ref().map(|c| c.to_string()).unwrap_or_else(|| q.value.raw.to_string())).collect();
                if t.expressions.is_empty() { return Expr::Str(quasis.concat(), loc); }
                Expr::Template { quasis, spans: t.expressions.iter().map(|x| self.expr(x)).collect(), loc }
            }
            Expression::TaggedTemplateExpression(t) => {
                let Expression::Identifier(tag) = &t.tag else {
                    return Expr::Reject { loc, rule: "S-Reject", message: "a tag that is not an identifier is not foldable".into() };
                };
                let quasis: Vec<String> = t.quasi.quasis.iter().map(|q| q.value.cooked.as_ref().map(|c| c.to_string()).unwrap_or_else(|| q.value.raw.to_string())).collect();
                Expr::Tagged { tag: tag.name.to_string(), quasis, spans: t.quasi.expressions.iter().map(|x| self.expr(x)).collect(), loc }
            }
            Expression::ObjectExpression(o) => {
                let mut members = vec![];
                for p in &o.properties {
                    match p {
                        ast::ObjectPropertyKind::ObjectProperty(op) => {
                            if op.kind != ast::PropertyKind::Init || op.method {
                                return Expr::Reject { loc: self.loc(op.span), rule: "S-Reject", message: "an accessor or method member is not foldable".into() };
                            }
                            let key = match &op.key {
                                PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                                PropertyKey::StringLiteral(s) => s.value.to_string(),
                                PropertyKey::NumericLiteral(n) => crate::js::number_to_string(n.value),
                                _ => return Expr::Reject { loc: self.loc(op.key.span()), rule: "S-Prop", message: "a computed or dynamic property name is not foldable".into() },
                            };
                            if op.shorthand { members.push(Member::Shorthand(key, self.loc(op.span))); } else { members.push(Member::Prop(key, self.expr(&op.value))); }
                        }
                        ast::ObjectPropertyKind::SpreadProperty(sp) => members.push(Member::Spread(self.expr(&sp.argument), self.loc(sp.span))),
                    }
                }
                Expr::Object(members, loc)
            }
            Expression::ArrayExpression(a) => Expr::Array(a.elements.iter().map(|el| self.element(el)).collect(), loc),
            Expression::StaticMemberExpression(mem) => Expr::Member { obj: Box::new(self.expr(&mem.object)), prop: mem.property.name.to_string(), optional: mem.optional, loc },
            Expression::ComputedMemberExpression(mem) => {
                let key = match mem.expression.without_parentheses() {
                    Expression::StringLiteral(s) => s.value.to_string(),
                    Expression::NumericLiteral(n) => crate::js::number_to_string(n.value),
                    _ => return Expr::Reject { loc: self.loc(mem.expression.span()), rule: "S-Index", message: "a non-literal element-access key is not foldable".into() },
                };
                Expr::Index { obj: Box::new(self.expr(&mem.object)), key, optional: mem.optional, loc }
            }
            Expression::ChainExpression(c) => match &c.expression {
                ast::ChainElement::StaticMemberExpression(mem) => Expr::Member { obj: Box::new(self.expr(&mem.object)), prop: mem.property.name.to_string(), optional: mem.optional, loc },
                ast::ChainElement::ComputedMemberExpression(mem) => {
                    let key = match mem.expression.without_parentheses() {
                        Expression::StringLiteral(s) => s.value.to_string(),
                        Expression::NumericLiteral(n) => crate::js::number_to_string(n.value),
                        _ => return Expr::Reject { loc: self.loc(mem.expression.span()), rule: "S-Index", message: "a non-literal element-access key is not foldable".into() },
                    };
                    Expr::Index { obj: Box::new(self.expr(&mem.object)), key, optional: mem.optional, loc }
                }
                ast::ChainElement::CallExpression(call) => self.call(call, loc),
                ast::ChainElement::TSNonNullExpression(x) => Expr::NonNull(Box::new(self.expr(&x.expression))),
                _ => Expr::Reject { loc, rule: "S-Reject", message: "unsupported optional chain".into() },
            },
            Expression::UnaryExpression(u) => {
                let op = match u.operator {
                    ast::UnaryOperator::LogicalNot => UnaryOp::Not,
                    ast::UnaryOperator::UnaryNegation => UnaryOp::Neg,
                    _ => return Expr::Reject { loc, rule: "S-Unary", message: format!("operator {} is not foldable", u.operator.as_str()) },
                };
                Expr::Unary { op, operand: Box::new(self.expr(&u.argument)), loc }
            }
            Expression::BinaryExpression(b) => {
                let op = b.operator.as_str();
                if !matches!(op, "+" | "-" | "*" | "/" | "===" | "!==" | ">" | "<" | ">=" | "<=") {
                    return Expr::Reject { loc, rule: "S-Binary", message: format!("operator {} is not foldable", op) };
                }
                Expr::Binary { op: op.to_string(), left: Box::new(self.expr(&b.left)), right: Box::new(self.expr(&b.right)), loc }
            }
            Expression::LogicalExpression(b) => Expr::Binary { op: b.operator.as_str().to_string(), left: Box::new(self.expr(&b.left)), right: Box::new(self.expr(&b.right)), loc },
            Expression::ConditionalExpression(c) => Expr::Conditional { test: Box::new(self.expr(&c.test)), then: Box::new(self.expr(&c.consequent)), els: Box::new(self.expr(&c.alternate)), loc },
            Expression::NewExpression(n) => {
                let callee = match n.callee.without_parentheses() { Expression::Identifier(id) => Some(id.name.to_string()), _ => None };
                Expr::New { callee, callee_loc: self.loc(n.callee.span()), args: n.arguments.iter().map(|a| self.argument(a)).collect(), loc }
            }
            Expression::CallExpression(call) => self.call(call, loc),
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
                Expr::Reject { loc, rule: "S-Reject", message: "a function used as a value is not foldable".into() }
            }
            _ => Expr::Reject { loc, rule: "S-Reject", message: format!("unsupported expression: {}", self.text_of(e.span()).chars().take(40).collect::<String>()) },
        }
    }

    fn call(&self, call: &ast::CallExpression, loc: Loc) -> Expr {
        let args: Vec<Element> = call.arguments.iter().map(|a| self.argument(a)).collect();
        match call.callee.without_parentheses() {
            Expression::Identifier(id) => Expr::Call { callee: id.name.to_string(), args, loc },
            Expression::StaticMemberExpression(mem) => Expr::MethodCall { obj: Box::new(self.expr(&mem.object)), method: mem.property.name.to_string(), optional: mem.optional || call.optional, args, loc },
            Expression::ChainExpression(c) => match &c.expression {
                ast::ChainElement::StaticMemberExpression(mem) => Expr::MethodCall { obj: Box::new(self.expr(&mem.object)), method: mem.property.name.to_string(), optional: true, args, loc },
                _ => Expr::Reject { loc, rule: "S-Reject", message: "unsupported call".into() },
            },
            _ => Expr::Reject { loc, rule: "S-Reject", message: "a call whose callee is not an identifier or a member is not foldable".into() },
        }
    }

    fn argument(&self, a: &ast::Argument) -> Element {
        match a {
            ast::Argument::SpreadElement(s) => Element::Spread(self.expr(&s.argument), self.loc(s.span)),
            other => Element::Plain(self.expr(other.to_expression())),
        }
    }

    fn element(&self, el: &ast::ArrayExpressionElement) -> Element {
        match el {
            ast::ArrayExpressionElement::SpreadElement(s) => Element::Spread(self.expr(&s.argument), self.loc(s.span)),
            ast::ArrayExpressionElement::Elision(e) => Element::Plain(Expr::Reject { loc: self.loc(e.span), rule: "S-Reject", message: "an array hole is not foldable".into() }),
            other => Element::Plain(self.expr(other.to_expression())),
        }
    }
}
