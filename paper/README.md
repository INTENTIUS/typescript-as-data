# Paper

Working material for the Onward! 2027 submission (#5, #30). Drafts here are Markdown under the prose ratchet; the LaTeX build lives in a separate repository created at camera-ready time and vendors `spec/` at a tagged version.

## Track

The target is Onward! Papers rather than Essays, because the Papers call accepts compelling arguments, exploratory implementations and substantial examples as validation, which is what this work has. The Essays call states that an essay does not contain definitive validation.

## Limits and dates

The figures below come from the 2026 call and stand until the 2027 call replaces them.

| Item | Value | Source |
|---|---|---|
| body at submission | 13 pages | SPLASH 2026 Onward! Papers call |
| body if accepted | 17 pages | same |
| review | single-blind | same |
| SPLASH 2026 deadline | 15 May 2026, passed | same |
| SPLASH 2027 deadline | not yet published; expect mid-May 2027 | 2027.splashcon.org is a placeholder |

Confirm the 2027 dates from the CFP when it appears and record them here.

## Files

Each draft feeds one section of the paper.

| File | Issue | Section it feeds |
|---|---|---|
| `introduction.md` | #52 | abstract and introduction |
| `mechanism.md` | #53, #55, #56 | the technical body: admissibility, the direction claim, the verdict, the fixpoint |
| `values-and-modes.md` | #58 | the value domain and the three evaluation modes |
| `related-work.md` | #27 | related work |
| `theorem.md` | #28 | the two claims and their proof sketches |
| `measurements.md` | #29 | evaluation |
| `discussion.md` | #54 | discussion |
| `figures/` | #57 | two SVGs: the taint boundary, and the two-phase shape |
| `../spec/prior-art.md` | #31 | the novelty narrowing, cited from related work |

## Still to write

Every section has a draft. What remains is the pass that turns seven Markdown files into thirteen pages: cutting to length, deciding what the mechanism section keeps when it has four pages rather than open space, and the figures. That pass wants the 2027 call in hand.

## Artifact

If the track offers artifact evaluation, the artifact is this repository at a tag. It holds:

- the specification
- the reference implementation
- the conformance suite
- the chant cross-check pinned to a release

Check whether Onward! Papers participates before assuming it.

## Endorsement and preprint

Onward! needs no endorser. A preprint on arXiv `cs.PL` needs one endorsement from an existing `cs.PL` author, or a co-author who already has one; that is separate from submission and can follow it.
