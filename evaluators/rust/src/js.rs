//! ECMAScript coercion (R10), reproduced rather than approximated: ToString,
//! ToNumber, truthiness, `+` dispatch, relational comparison and strict
//! equality, as the coercion fixtures (#81) pin them.
use crate::value::V;

/// Number::toString(10) as ECMAScript specifies it: the shortest digits that
/// round-trip, laid out by the exponent, `1e+21` and `1.5e-7` where JavaScript
/// switches to exponential form, `0` for negative zero.
pub fn number_to_string(n: f64) -> String {
    if n.is_nan() { return "NaN".into(); }
    if n == 0.0 { return "0".into(); }
    if n.is_infinite() { return if n > 0.0 { "Infinity".into() } else { "-Infinity".into() }; }
    let neg = n < 0.0;
    let a = n.abs();
    // Rust's `{:e}` prints the shortest round-trip digits as d.ddde±x.
    let sci = format!("{:e}", a);
    let (mant, exp) = sci.split_once('e').expect("exponent form");
    let e: i32 = exp.parse().expect("exponent");
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let nn = e + 1; // decimal point position: value = 0.digits × 10^nn
    let body = if k <= nn && nn <= 21 {
        format!("{}{}", digits, "0".repeat((nn - k) as usize))
    } else if 0 < nn && nn <= 21 {
        format!("{}.{}", &digits[..nn as usize], &digits[nn as usize..])
    } else if -6 < nn && nn <= 0 {
        format!("0.{}{}", "0".repeat((-nn) as usize), digits)
    } else {
        let sign = if nn - 1 < 0 { "-" } else { "+" };
        let ex = (nn - 1).abs();
        if k == 1 { format!("{}e{}{}", digits, sign, ex) } else { format!("{}.{}e{}{}", &digits[..1], &digits[1..], sign, ex) }
    };
    if neg { format!("-{}", body) } else { body }
}

/// ToString over the domain. An envelope has no string form (F-Eval-Template);
/// the caller rejects before asking.
pub fn to_string(v: &V) -> String {
    match v {
        V::Undefined | V::Chain => "undefined".into(),
        V::Null => "null".into(),
        V::Bool(b) => b.to_string(),
        V::Num(n) => number_to_string(*n),
        V::Str(s) => s.clone(),
        V::Arr(a) => a.iter().map(|e| match e { V::Undefined | V::Null => String::new(), _ => to_string(e) }).collect::<Vec<_>>().join(","),
        V::Obj(_) | V::Namespace(_) => "[object Object]".into(),
        V::Func(_) | V::Host(_) => "function".into(),
    }
}

/// StringToNumber: whitespace trimmed, empty is 0, decimal and hex forms,
/// `Infinity`, anything else NaN.
pub fn string_to_number(s: &str) -> f64 {
    let t = s.trim();
    if t.is_empty() { return 0.0; }
    let (sign, rest) = match t.as_bytes()[0] { b'-' => (-1.0, &t[1..]), b'+' => (1.0, &t[1..]), _ => (1.0, t) };
    if rest == "Infinity" { return sign * f64::INFINITY; }
    if let Some(hex) = rest.strip_prefix("0x").or_else(|| rest.strip_prefix("0X")) {
        if sign < 0.0 { return f64::NAN; }
        return i64::from_str_radix(hex, 16).map(|n| n as f64).unwrap_or(f64::NAN);
    }
    if rest.chars().all(|c| c.is_ascii_digit() || c == '.' || c == 'e' || c == 'E' || c == '-' || c == '+') && !rest.contains("inf") && !rest.contains("nan") {
        rest.parse::<f64>().map(|n| sign * n).unwrap_or(f64::NAN)
    } else {
        f64::NAN
    }
}

pub fn to_number(v: &V) -> f64 {
    match v {
        V::Undefined | V::Chain => f64::NAN,
        V::Null => 0.0,
        V::Bool(b) => if *b { 1.0 } else { 0.0 },
        V::Num(n) => *n,
        V::Str(s) => string_to_number(s),
        V::Arr(a) => match a.len() { 0 => 0.0, 1 => to_number(&a[0]), _ => f64::NAN },
        _ => f64::NAN,
    }
}

pub fn truthy(v: &V) -> bool {
    match v {
        V::Undefined | V::Null | V::Chain => false,
        V::Bool(b) => *b,
        V::Num(n) => !(*n == 0.0 || n.is_nan()),
        V::Str(s) => !s.is_empty(),
        _ => true,
    }
}

pub fn nullish(v: &V) -> bool {
    matches!(v, V::Undefined | V::Null | V::Chain)
}

/// ToPrimitive for `+`: an object or array becomes its string.
fn primitive_is_string(v: &V) -> Option<String> {
    match v {
        V::Str(s) => Some(s.clone()),
        V::Arr(_) | V::Obj(_) | V::Namespace(_) => Some(to_string(v)),
        _ => None,
    }
}

pub fn plus(a: &V, b: &V) -> V {
    let (pa, pb) = (primitive_is_string(a), primitive_is_string(b));
    if pa.is_some() || pb.is_some() {
        V::Str(format!("{}{}", pa.unwrap_or_else(|| to_string(a)), pb.unwrap_or_else(|| to_string(b))))
    } else {
        V::Num(to_number(a) + to_number(b))
    }
}

/// Abstract relational comparison: both strings compare by code unit, else as numbers. `None` is undefined (NaN involved).
pub fn less_than(a: &V, b: &V) -> Option<bool> {
    if let (V::Str(x), V::Str(y)) = (a, b) {
        return Some(x.encode_utf16().lt(y.encode_utf16()));
    }
    let (x, y) = (to_number(a), to_number(b));
    if x.is_nan() || y.is_nan() { None } else { Some(x < y) }
}

pub fn strict_equal(a: &V, b: &V) -> bool {
    match (a, b) {
        (V::Undefined, V::Undefined) | (V::Null, V::Null) => true,
        (V::Bool(x), V::Bool(y)) => x == y,
        (V::Num(x), V::Num(y)) => x == y,
        (V::Str(x), V::Str(y)) => x == y,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::number_to_string as s;
    #[test]
    fn number_formatting_is_ecmascript() {
        assert_eq!(s(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(s(1e21), "1e+21");
        assert_eq!(s(-0.0), "0");
        assert_eq!(s(1.0 / 3.0), "0.3333333333333333");
        assert_eq!(s(100.0), "100");
        assert_eq!(s(1.5e-7), "1.5e-7");
        assert_eq!(s(9007199254740993.0), "9007199254740992");
        assert_eq!(s(123456789012345680000.0), "123456789012345680000");
        assert_eq!(s(0.000001), "0.000001");
        assert_eq!(s(1e-7), "1e-7");
        assert_eq!(s(-2.5), "-2.5");
    }
}
