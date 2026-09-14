# J4. Properties and observables

Rules that are about the whole mechanism rather than one judgment.

**F-NoOwnExecution (property).** For every file with final verdict `fold`,
none of its top-level statements is executed by the build. What still
executes is bounded and named: revival of envelopes (F-Val-Fate),
F-Eval-CallEager, F-Eval-CallMethod on a real receiver, and, under `open`,
invocation of an imported factory (J2 F-Call step 6). All of it is code the
file *imported*; none of it is code the file *wrote*. (Was.)

**F-Depth.** An implementation bounds three recursions and may choose the values.

| Bound | chant | Terminates |
|---|---|---|
| `MAX_FUNCTION_CALL_DEPTH` | 32 | nested project-local calls (F-Eval-CallLocal step 2) |
| `MAX_INTERPRETATION_DEPTH` | 16 | nested factory interpretation |
| `MAX_RESOLUTION_DEPTH` | 200 | the cross-file resolution stack |

- The values must be stated and they are the implementation's to choose;
  F-Eval-CallLocal step 2 names no number.
- Exhaustion must produce `run`. How the recursion is counted is also the
  implementation's: chant's call-depth bound counts nested folded bodies on
  its expression path, a cross-file recursion is bounded by the engine's
  stack instead, and the overflow is caught and reported as a fallback.
- chant has met both for all three bounds since v0.68.0 when the
  interpretation bound stopped degrading to invocation under a `fold` verdict
  and began throwing a propagated depth error that names the bound and falls
  the file back to run (chant#2370).

**F-Obs-Counters.** A conforming implementation exposes, per build and
resettable, three non-negative integers: in-process factory/constructor
invocations performed while folding; of those, how many resolved to
project-owned code; and how many factory bodies were interpreted instead.
Names are not normative; the shape is. Under `isolated` the second is zero
across every folded file (F-IsolatedRefusal). (Was.)

**F-Obs-Report.** A conforming implementation reports, per file, the final
verdict and, for `run`, a located reason (F-Reason). A fallback is not an
error, which is exactly why an unreported one would make F-NoOwnExecution
unauditable. Summary versus verbose is presentation. A reason produced by
J3's backward edge must be able to say "forced to run because `f` runs and
you captured its objects", since nothing in the file's own source predicts
it. (Was.)

**F-Obs-Provenance.** Path provenance, which composite parameter produced
which emitted field, first (innermost) writer wins, is an *optional*
capability outside the equivalence objective: the run path does not
uniformly produce it, so requiring it would oblige fold and run to agree on
something one side lacks. Conformance reports whether it is supported.
(Was.)

**F-Obs-Messages.** Message *stability* is not normative. Location and rule
identifier are (F-Reason). One-builder-per-kind is a property of one
implementation's tooling; a second implementation cannot share strings.
(Was.)
