// Release configuration for `chant release`. `just release-workflow` renders
// .github/workflows/publish.yml from it.
export default {
  release: {
    tag: "tsad-v{version}",
    green: "forge-checks",
    version: {
      packages: [
        "packages/conformance",
        "packages/reference"
      ],
      ranges: "exact"
    },
    publish: [
      {
        type: "npm",
        access: "public",
        stage: false,
        packages: [
          "packages/conformance",
          "packages/reference"
        ]
      }
    ],
    check: [
      "npm run typecheck",
      "npm test",
      "npm run lint:prose",
      "npm run smoke:published"
    ],
    workflow: {
      trigger: "dispatch",
      doctor: false,
      file: ".github/workflows/publish.yml",
      chant: "npx --yes @intentius/chant@0.124.104",
      build: "npm run build && bash scripts/release-spec-version.sh"
    }
  }
};
