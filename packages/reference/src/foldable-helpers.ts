// Ported from INTENTIUS/chant packages/core/src/fold/foldable-helpers.ts at 1b9f5133 (Apache-2.0).
// Derived, not rewritten (#19). Every chant-specific cut is listed in ../CUTS.md.

/**
 * foldable-helpers — the closed, declared allowlist of chant's OWN authoring
 * helpers that a call expression may fold through (chant #1082, epic #1019).
 *
 * ## Why this exists
 *
 * `fold()` has no general case for a `CallExpression`: a function call as a
 * value is structurally unrepresentable there, because folding it would mean
 * executing code, which is the one thing the fold path exists to avoid. That
 * rule is right for user code and stays right — a user's own function, an
 * arrow function, a method call (`naming.name(...)`) all keep failing exactly
 * as before.
 *
 * But it also blocks chant's own documented authoring API. `phase("Apply",
 * [...])` is how the component contract says to write a component; `output(ref,
 * "oX")` is how a lexicon output is authored. An application cannot avoid them
 * and still use components or outputs, so every file that uses one falls back
 * to run no matter how statically evaluable the rest of it is.
 *
 * #1044 already settled the shape of the answer one level down, for lexicon
 * intrinsics: a call-shaped thing may fold ONLY when it is registered, opt-in,
 * per-helper — never because it merely looks like a call. This module is the
 * same decision applied one level up, to chant's own helpers, with the
 * registration written here by hand instead of coming from a lexicon manifest.
 *
 * ## What "registered" buys, and what still has to be true
 *
 * A name in this list is NOT permission to invoke whatever it happens to be
 * bound to. Folding a helper call is a two-key operation:
 *
 *   1. **Shape + name** (here, and in `fold()`/`findSubsetViolation`): the
 *      callee is a bare identifier whose text is in {@link
 *      FOLDABLE_AUTHORING_HELPERS} and which is not shadowed by a local
 *      `const`. `fold()` reduces the call to a symbolic
 *      `{ __helper, args }` envelope — it still executes nothing.
 *   2. **Provenance + invocation** (`../discovery/fold-import.ts`): the
 *      envelope is revived by resolving that name through the folding FILE'S
 *      OWN `import` bindings and checking the import actually comes from chant
 *      ({@link isChantOwnedSpecifier}, or a path inside chant-core's own tree
 *      for in-repo/absolute-specifier callers). Only then is the real function
 *      invoked, with the real folded arguments. A same-named helper imported
 *      from somewhere else, or declared in the file itself, resolves to
 *      nothing chant owns and the whole file falls back to run.
 *
 * So the function that runs is always the same function the run path would
 * have called, from the same module the source itself imported — fold does not
 * substitute its own reimplementation, which is why this list cannot drift
 * from the helpers' real behavior.
 *
 * ## Admission criteria
 *
 * A helper belongs here only if all of these hold:
 *
 *   - chant owns and documents it as authoring surface;
 *   - it is a pure function of its arguments — no I/O, no `process.env`, no
 *     module-level mutable state, no observable side effect;
 *   - calling it early (at fold time) is indistinguishable from calling it
 *     during a real run of the file.
 *
 * Deliberately NOT admitted — see this module's tests and the #1082 PR body:
 *
 *   - `env()` (`../env.ts`) reads `process.env`. Folding it would bake one
 *     run's environment into a statically-derived value. It is exactly the
 *     kind of call fold must keep rejecting.
 *   - `Op()` (`../op/builders.ts`) constructs an `OpResource` — a `Declarable`.
 *     `fold()` already rejects a nested `new Type(...)` used as a value for a
 *     real, differential-caught reason (the envelope leaks into
 *     serialization); a factory that returns one is the same hazard wearing a
 *     call. Still true after #2171, which registered the ConvergeOp RULE
 *     builders below. Those return plain data that an Op carries; `Op()`
 *     itself returns the entity, and a top-level `export const x = Op({...})`
 *     folds through the composite spine in `../discovery/fold-import.ts`
 *     rather than through this list, which is why it needs no entry here.
 *   - `propagate()`, `withDefaults()`, `resource()`, `mergeDefaults()`
 *     (`../composite.ts`) are composite *definition* helpers, not value-position
 *     helpers. `propagate()` in particular mutates its argument in place, and
 *     the composite spine in fold-import.ts already resolves it live.
 *   - `createResource()`/`createProperty()` (`../runtime.ts`) are used at a
 *     lexicon module's top level to build classes, never as a value inside a
 *     project file.
 *   - Lexicon intrinsics in CALL form (`Ref(...)`, `Join(...)`) are lexicon
 *     surface, not chant's own, and are #1044's registry (`IntrinsicDef`,
 *     `../lexicon.ts`) to admit — not this one. Only their tagged-template
 *     form folds today.
 */

/**
 * One registered helper. `module` and `note` carry no runtime behavior — they
 * are the audit trail for why this entry passed the admission criteria above,
 * kept next to the name it justifies rather than in a comment that can drift
 * away from the list.
 */
export interface FoldableHelperDef {
  /** The exported name, matched against the callee identifier's text. */
  readonly name: string;
  /** Where chant defines it (a path under `packages/core/src`, for the audit trail). */
  readonly module: string;
  /** Why it qualifies — what it returns and why calling it at fold time is safe. */
  readonly note: string;
}

/**
 * The allowlist. Adding an entry is a deliberate act: it must satisfy every
 * admission criterion in this module's doc, and it widens what `fold()` and
 * `findSubsetViolation` accept for EVERY project, so it belongs in a PR that
 * says so.
 *
 * Two names below are defined TWICE in chant, by different modules, with
 * different return types (`phase`/`gate` by both the component contract and
 * the Op builders; `stackOutput` by both the component contract and the
 * cross-stack output primitive). That is fine and needs no disambiguation
 * here: registration is by name, but the function actually invoked is the one
 * the folding file itself imported (see step 2 in the module doc), so each
 * file gets its own. Both definitions of each name independently satisfy the
 * criteria, which is what makes registering the shared name safe.
 */
/**
 * CUT (#19): chant's nineteen registered helpers were a hand-written list here.
 * A host installs its own list; the reference ships none (F-Host-Admission).
 */
const HELPERS: FoldableHelperDef[] = [];
export function registerHelpers(defs: readonly FoldableHelperDef[]): void {
  HELPERS.splice(0, HELPERS.length, ...defs);
  HELPER_NAMES.clear();
  for (const d of defs) HELPER_NAMES.add(d.name);
}
export const FOLDABLE_AUTHORING_HELPERS: readonly FoldableHelperDef[] = HELPERS;

const HELPER_NAMES = new Set<string>();

/**
 * True when `name` is a registered foldable authoring helper. Name-only — this
 * is the shape-level half of the check (step 1 in the module doc). It says
 * nothing about where the name is bound; `../discovery/fold-import.ts` decides
 * that before anything is invoked.
 */
export function isFoldableHelperName(name: string): boolean {
  return HELPER_NAMES.has(name);
}

/**
 * Package specifiers chant itself publishes. A registered helper name only
 * folds when the folding file imported it from one of these — or, for in-repo
 * and test callers that import chant-core by relative/absolute path, from
 * inside chant-core's own tree (checked separately, in fold-import.ts, since
 * only that module knows how to resolve a specifier to a path).
 *
 * Lexicon packages are included because several core helpers are re-exported
 * through them and that is the documented import in real projects — e.g.
 * `import { output } from "@intentius/chant-lexicon-aws"`.
 */
const HOST_PACKAGE_SPECIFIERS: string[] = [];
export function registerHostSpecifiers(prefixes: readonly string[]): void { HOST_PACKAGE_SPECIFIERS.splice(0, HOST_PACKAGE_SPECIFIERS.length, ...prefixes); }

/** True for a bare specifier that names a chant-published package (or one of its subpaths). */
export function isHostOwnedSpecifier(specifier: string): boolean {
  return HOST_PACKAGE_SPECIFIERS.some(
    (prefix) => specifier === prefix || specifier.startsWith(prefix.endsWith("-") ? prefix : `${prefix}/`),
  );
}
