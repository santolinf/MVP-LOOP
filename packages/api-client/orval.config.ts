import { defineConfig } from "orval";

export default defineConfig({
  loop: {
    input: "./openapi.json",
    output: {
      mode: "tags-split",
      target: "./src/generated/endpoints.ts",
      schemas: "./src/generated/model",
      client: "react-query",
      override: { mutator: { path: "./src/fetcher.ts", name: "customFetch" } },
    },
  },
});
