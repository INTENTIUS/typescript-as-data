/**
 * An exact ledger of everything this implementation invokes while folding.
 *
 * F-NoOwnExecution names a closed set: "revival of envelopes (F-Val-Fate),
 * F-Eval-CallEager, F-Eval-CallMethod on a real receiver, and invocation of a
 * package's factory (J2 F-Call step 6)". The claim is closure rather than
 * volume, so the instrument has to enumerate what ran and not sample it. A
 * CPU profile cannot: it has a floor, and "0 MB" means "nothing the profiler
 * could see" rather than "nothing ran" (#177).
 *
 * So every site in this package that invokes code it did not write records
 * the invocation here first, tagged with the rule that admits it. A reader of
 * the ledger can check the tags against F-NoOwnExecution's list and an
 * untagged invocation is a violation by construction.
 *
 * Process-wide and resettable, which is the shape F-Obs-Counters already
 * specifies for the three integers in L10.1. This is those counters at the
 * grain the property is stated in.
 *
 * The ledger is evidence, never semantics: with no sink installed `record` is
 * a single optional call and the fold is unchanged. Nothing in this package
 * reads it back.
 */

/** One invocation of code this implementation did not write. */
export interface ExecutionEvent {
  /** The rule that admits it, as F-NoOwnExecution names them. */
  readonly rule: string;
  /** Which arm of that rule: what kind of thing was invoked. */
  readonly what: string;
  /** The binding it was reached through, for reading the ledger back. */
  readonly name: string;
}

let sink: ((e: ExecutionEvent) => void) | undefined;

/** Called immediately before an invocation, at every site that performs one. */
export const record = (rule: string, what: string, name: string): void => sink?.({ rule, what, name });

/**
 * Collect every invocation `body` performs. Restores the previous sink, so a
 * harness that folds more than once keeps the panels apart.
 */
export function recording<T>(into: (e: ExecutionEvent) => void, body: () => T): T {
  const previous = sink;
  sink = into;
  try {
    return body();
  } finally {
    sink = previous;
  }
}
