# Local entry points. CI runs the same commands from package.json; these are
# the ones a person types.

# Typecheck, the suite, and the prose ratchet: what CI's check job runs.
check:
    npm run typecheck
    npm test
    npm run lint:prose

# The docs site, built to docs/public/ with Hugo (syncs spec/ and the
# figures first). `brew install hugo` once.
site:
    npm run docs:build

# The docs site with live reload at http://localhost:8000/typescript-as-data/.
# `just site-serve 8001` picks another port when a second checkout is serving.
site-serve port="8000":
    bash scripts/build-wasm.sh
    node docs/scripts/sync-spec.mjs
    cd docs && hugo server --bind 127.0.0.1 --port {{port}} --openBrowser

# The corpus cross-check and the citation gate, against a chant checkout.
# Pass the checkout: `just corpus ../chant`. The paper's number is taken with
# the checkout at the pinned tag, seeded per the memory notes.
corpus repo:
    TSAD_CHANT_REPO={{repo}} npm run corpus

# Pack both packages, install them into a fresh directory, run the suite there.
smoke-published:
    npm run smoke:published

# The smokeable claims (#146): `just smoke` lists them, `just smoke <claim>`
# runs one against a throwaway Forgejo on Docker Compose, and `BREAK=1 just
# smoke <claim>` watches it catch the broken case. Needs Docker and Node.
smoke claim="":
    bash scripts/smoke.sh {{claim}}
