import { defineConfig } from "vitest/config";
import preset from "@loop/config/vitest";

// Not mergeConfig: that concatenates `include` arrays and would run the whole unit suite too.
export default defineConfig({
  resolve: preset.resolve,
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
