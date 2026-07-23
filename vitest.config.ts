import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup-env.ts"],
  },
});
