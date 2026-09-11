# Cuts made porting chant's expression layer (#19)

Source: INTENTIUS/chant `packages/core/src/fold/{subset,fold,foldable-helpers}.ts` at `f8ae312b` (chant-v0.69.0). Derived, not rewritten. Each row is one place chant-specific code had to be cut, and what the cut is in the host interface (#20).

| File | What was cut | Why, and where it went |
|---|---|---|
| `subset.ts` | import … from "../lexicon" | the intrinsic registry type and its three fold predicates are host vocabulary; moved to host.ts (F-Host-Registry) |
| `foldable-helpers.ts` | FOLDABLE_AUTHORING_HELPERS, nineteen chant helpers | the allowlist is host vocabulary; the reference ships an empty list and registerHelpers() (F-Host-Interface item 4, F-Host-Admission) |
| `foldable-helpers.ts` | isChantOwnedSpecifier / CHANT_PACKAGE_SPECIFIERS | trust by specifier text is host vocabulary (F-Host-Trust arm 1); renamed isHostOwnedSpecifier over a host-installed prefix list |
| `fold.ts` | import … from "../lexicon" | same as subset.ts |
| `fold.ts` | fileLabel: relative(process.cwd(), file) | diagnostic path presentation; the mechanism only needs the file identity (F-Reason) |
| `subset.ts, fold.ts` | SubsetRuleId = "EVL001" | "EVL003" | kept verbatim: these are chant's lint rule ids riding on rejections; the spec's ids are S-Reject / S-Index. Mapping is a #20 decision, not a port cut |

Everything else in the three files is unchanged, comments included. The discovery layer (`fold-import.ts`: revival, interpretation, taint) is not ported (#21, #22).

## What the cuts say about the host interface (#20)

The expression layer needed exactly three of the six things `spec/hosts.md` lists: the intrinsic registry with its three predicates (item 3), the authoring-helper allowlist (item 4), and the owned-specifier prefixes that back trust by text (item 5). Entity constructors, attribute exposure and composite registration (items 1, 2, 6) never appear in these files; they belong to revival and interpretation in the discovery layer, which is #21 and #22. Nothing had to be designed; every hook is a cut.

## Keeping the port current

`scripts/sync-port.mjs <chant-root> <sha>` regenerates the three files and
re-applies every cut above. Each cut is matched textually and the script exits
non-zero if one no longer matches, so a chant change that moves a cut site
fails loudly instead of producing a port with a cut silently dropped. Run it
after any chant release that touches `packages/core/src/fold/`, then run the
conformance suite: a behavioural change chant made and the port missed shows up
as a fixture disagreement.

This is not optional hygiene. chant-v0.69.0 extended `symbolicEnvelopeKind`
from three envelope kinds to five; until the port was re-synced, the reference
and chant disagreed on `` `${new T({})}` `` in the direction the cross-check
exists to catch.
