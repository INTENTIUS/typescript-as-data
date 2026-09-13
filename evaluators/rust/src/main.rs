//! The binary: `tsad_eval::handle` over stdin and stdout, which is how the
//! conformance adapter in packages/conformance/src/adapters/rust.ts drives it.
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let out = tsad_eval::handle(&input);
    if out.starts_with("{\"error\":\"bad request") { println!("{}", out); std::process::exit(2); }
    println!("{}", out);
}
