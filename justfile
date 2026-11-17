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
    node docs/scripts/figures.mjs
    cd docs && hugo server --bind 127.0.0.1 --port {{port}} --openBrowser

# The corpus cross-check and the citation gate, against a chant checkout.
# Pass the checkout: `just corpus ../chant`. The paper's number is taken with
# the checkout at the pinned tag, seeded per the memory notes.
corpus repo:
    TSAD_CHANT_REPO={{repo}} npm run corpus

# Pack both packages, install them into a fresh directory, run the suite there.
smoke-published:
    npm run smoke:published

# Releases go through `chant release`, set up in chant.config.ts. One
# release publishes @intentius/tsad-conformance and @intentius/tsad-reference
# at one version, tagged tsad-v<version>, from .github/workflows/publish.yml.
# The cut refuses a version whose major.minor is not spec/VERSION, and the
# suite and the pack-install-run smoke pass before either package publishes.
# The version is still committed first, in both package.json files, the lock
# file and the paper's "published to npm at" line, which spec/paper.test.ts
# holds to the packages; then `just release 2.3.1` starts the release of that
# version. A label the commit does not carry fails the suite at the cut.
release label:
    gh workflow run publish.yml -f label={{label}}

# The label the next release gets, from the conventional commits since the last one.
release-next:
    npx --yes @intentius/chant@0.124.104 release next

# What a cut of HEAD would do, without writing anything. HEAD must be on origin/main.
release-plan:
    GH_TOKEN=$(gh auth token) npx --yes @intentius/chant@0.124.104 release cut auto --dry-run

# Regenerate .github/workflows/publish.yml from chant.config.ts. chant writes
# that file; change the config and run this rather than editing it.
release-workflow:
    npx --yes @intentius/chant@0.124.104 release workflow

# The smokeable claims (#146): `just smoke` lists them, `just smoke <claim>`
# runs one against a throwaway Forgejo on Docker Compose, and `BREAK=1 just
# smoke <claim>` watches it catch the broken case. Needs Docker and Node.
smoke claim="":
    bash scripts/smoke.sh {{claim}}

# The paper's draft (paper/draft.md) rendered to HTML at paper/build/draft.html.
# No PDF: a binary in the repository would need LFS, and HTML is enough to read.
paper:
    mkdir -p paper/build
    pandoc paper/draft.md --standalone --toc --number-sections=false --resource-path=paper -o paper/build/draft.html
    @echo paper/build/draft.html
