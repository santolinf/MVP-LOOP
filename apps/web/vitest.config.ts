import preset from "@loop/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  preset,
  defineConfig({
    // Web tests live beside the code under app/ (the shared preset only globs src/ and test/).
    test: { include: ["app/**/*.test.{ts,tsx}"] },
  }),
);
