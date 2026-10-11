import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Runs the trust measurement only. It downloads public repositories, so it is
 * kept out of `npm test` and started on purpose with `npm run trust:measure`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["trust/**/*.trust.ts"],
    testTimeout: 20 * 60 * 1000,
    fileParallelism: false,
  },
});
