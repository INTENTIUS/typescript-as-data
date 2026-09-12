# Local entry points. CI runs the same commands from package.json; these are
# the ones a person types.

# Typecheck, the suite, and the prose ratchet: what CI's check job runs.
check:
    npm run typecheck
    npm test
    npm run lint:prose

# The docs site, built to docs/dist/ (syncs spec/ and the figures first).
site:
    npm run --prefix docs build

# The docs site with live reload at http://localhost:4321/typescript-as-data/
site-dev:
    npm run --prefix docs dev

# Serve the last build of the site, the way it will be published.
site-preview: site
    npm run --prefix docs preview

# The corpus cross-check and the citation gate, against a chant checkout.
# Pass the checkout: `just corpus ../chant`. The paper's number is taken with
# the checkout at the pinned tag, seeded per the memory notes.
corpus repo:
    TSAD_CHANT_REPO={{repo}} npm run corpus

# Pack both packages, install them into a fresh directory, run the suite there.
smoke:
    npm run smoke:published
