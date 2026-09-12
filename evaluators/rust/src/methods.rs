//! F-Eval-CallMethod on a real receiver: the methods a string, array or
//! number offers that are pure functions of the receiver and the arguments.
//! A method not listed is "not a function" here and the call rejects.
use crate::js;
use crate::value::V;

pub fn call_method(x: &V, m: &str, args: &[V]) -> Option<V> {
    let arg = |i: usize| args.get(i).cloned().unwrap_or(V::Undefined);
    match x {
        V::Str(s) => match m {
            "toUpperCase" => Some(V::Str(s.to_uppercase())),
            "toLowerCase" => Some(V::Str(s.to_lowercase())),
            "trim" => Some(V::Str(s.trim().to_string())),
            "trimStart" => Some(V::Str(s.trim_start().to_string())),
            "trimEnd" => Some(V::Str(s.trim_end().to_string())),
            "startsWith" => Some(V::Bool(s.starts_with(&js::to_string(&arg(0))))),
            "endsWith" => Some(V::Bool(s.ends_with(&js::to_string(&arg(0))))),
            "includes" => Some(V::Bool(s.contains(&js::to_string(&arg(0))))),
            "split" => Some(V::Arr(match &arg(0) { V::Undefined => vec![V::Str(s.clone())], sep => s.split(js::to_string(sep).as_str()).map(|p| V::Str(p.to_string())).collect() })),
            "toString" => Some(V::Str(s.clone())),
            "replaceAll" => match (&arg(0), &arg(1)) { (V::Str(a), V::Str(b)) => Some(V::Str(s.replace(a.as_str(), b))), _ => None },
            "padStart" | "padEnd" => {
                let n = js::to_number(&arg(0)) as usize; let pad = match &arg(1) { V::Undefined => " ".to_string(), p => js::to_string(p) };
                if pad.is_empty() || s.chars().count() >= n { return Some(V::Str(s.clone())); }
                let need = n - s.chars().count(); let fill: String = pad.chars().cycle().take(need).collect();
                Some(V::Str(if m == "padStart" { format!("{}{}", fill, s) } else { format!("{}{}", s, fill) }))
            }
            _ => None,
        },
        V::Arr(a) => match m {
            "join" => Some(V::Str(a.iter().map(|e| match e { V::Undefined | V::Null => String::new(), _ => js::to_string(e) }).collect::<Vec<_>>().join(&match &arg(0) { V::Undefined => ",".to_string(), sep => js::to_string(sep) }))),
            "includes" => Some(V::Bool(a.iter().any(|e| js::strict_equal(e, &arg(0))))),
            "concat" => { let mut out = a.clone(); for x in args { match x { V::Arr(b) => out.extend(b.clone()), other => out.push(other.clone()) } } Some(V::Arr(out)) }
            "slice" => {
                let len = a.len() as i64; let norm = |v: &V, d: i64| { let n = if matches!(v, V::Undefined) { d } else { js::to_number(v) as i64 }; (if n < 0 { (len + n).max(0) } else { n.min(len) }) as usize };
                let (s, e) = (norm(&arg(0), 0), norm(&arg(1), len)); Some(V::Arr(if s < e { a[s..e].to_vec() } else { vec![] }))
            }
            "toString" => Some(V::Str(js::to_string(x))),
            _ => None,
        },
        V::Num(n) => match m {
            "toString" => Some(V::Str(js::number_to_string(*n))),
            "toFixed" => { let d = js::to_number(&arg(0)); let d = if d.is_nan() { 0 } else { d as usize }; Some(V::Str(format!("{:.*}", d, n))) }
            _ => None,
        },
        V::Bool(b) => match m { "toString" => Some(V::Str(b.to_string())), _ => None },
        _ => None,
    }
}
