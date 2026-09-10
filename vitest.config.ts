import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "spec/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    // @intentius/chant ships TypeScript source as its default entry; inline it so vite transforms it.
    server: { deps: { inline: [/@intentius\/chant/] } },
  },
});
