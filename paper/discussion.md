# Discussion

Draft for #54.

## What the design costs

**A leaf fix buys nothing while an importer runs.** Because taint flows forward along imports, a perfectly foldable file imported by a file that runs is itself forced to run. Making a leaf foldable therefore changes nothing until every file in the closure above it also folds. This was observed before it was understood: coverage on a real consuming application fell after a leaf was migrated to a foldable form, which looked like a regression and was the rule working. It is the soundness condition of `F-Succ`, not a defect, and an implementation that optimised it away would reintroduce the two-objects problem the fixpoint exists to prevent.

**A file's verdict is not a property of its own source.** The backward edge means a folded file can be forced to run because some other file captured one of its objects and then fell back. Nothing in the first file predicts that. The practical consequence is a reporting obligation: a fallback reason must be able to say that a file ran because another file ran and captured from it, and not merely quote a construct.

**Coverage is not the security-relevant number.** A file that folds executes none of its own code either way, so partial coverage does nothing for the files that matter. Isolating the fallback is what bounds the remainder, and it changes what folds: a fold that would invoke project-owned code is refused under isolation. The specification therefore carries isolation as a mode of the verdict rather than as a deployment detail.

## What is unresolved

Three places where the implementation settled a question by accident rather than decision, each recorded in the specification rather than smoothed over.

**Flow insensitivity.** The classifier requires every branch of a short-circuiting operator to be admissible where the evaluator folds only the taken one, so `false && f()` is a lint error on code that folds cleanly. The implementation's own documentation calls this a wart. Making the classifier flow-sensitive means writing an evaluator inside a lint rule.

**The `.step` narrowing.** One member name is admitted after a call, because one idiom uses it. There is no principled boundary that admits `.step` and excludes the next member somebody needs.

**Eager evaluation.** One class of registered call is evaluated at fold time rather than enveloped, because its usual use coerces the result to a string before revival would run. The rule exists to serve a coercion, not because eagerness is right.

A specification that presented these as designed would be easier to read and less true.

## What would falsify the claim

The identity theorem is the paper's centre, so it is worth saying what would break it rather than restating that it holds. Three things would.

**A single fold/run disagreement on a mixed build.** The differential requires identical errors and byte-identical output for every corpus entry, including the twelve with at least one file that falls back. One disagreement there is either a bug in the fixpoint or a gap in the argument, and the entry would name itself.

**An entity reachable by two paths with different verdicts.** The theorem's case analysis rules this out given `F-Memo` and `F-Count`. Two implementation choices would produce it anyway: memoising per referrer instead of per build, or invoking a composite once per member access. The corpus would not necessarily catch either.

**A sharing relationship the capture set does not record.** The backward edge depends on knowing who captured whose objects. `F-Capture` records non-primitive captures through imports and `F-CallLeak` records them through calls. A third route into another file's objects that neither records would make the fixpoint incomplete, and nothing currently searches for one.

## What would change the claims

Two things, and only two.

**An implementation by someone who has not read chant.** The reference implementation now covers the module layer and the fixpoint as well as the expression layer, written from the specification and agreeing with the production implementation on every fixture and on every comparable file of chant's corpus. It shares an author with chant. An evaluator of the `data-host` profile in a language with no JavaScript engine (typescript-as-data#86) would be the first implementation that could not lean on one, and it would test the coercion fixtures in a way a JavaScript implementation cannot.

**A corpus nobody here maintains.** Every measurement comes from one project's examples, written by people who know the subset. The measurement that would mean the most is the one not yet taken: source written against the specification by someone who has not read the implementation.
