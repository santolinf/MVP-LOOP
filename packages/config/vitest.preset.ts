import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Workspace packages publish compiled dist/ (for the Docker runtime). Tests alias them back to source so
// vi.mock("@loop/db") intercepts and no build step is needed before `pnpm test`.
const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@loop\/db$/, replacement: src("db") },
      { find: /^@loop\/domain$/, replacement: src("domain") },
      { find: /^@loop\/contracts$/, replacement: src("contracts") },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    passWithNoTests: true,
  },
});
