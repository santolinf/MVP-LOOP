import { defineConfig, mergeConfig } from "vitest/config";
import preset from "@loop/config/vitest";

// Integration tests (*.int.test.ts) need Docker; they run via `pnpm test:integration`.
export default mergeConfig(preset, defineConfig({ test: { exclude: ["**/node_modules/**", "**/*.int.test.ts"] } }));
