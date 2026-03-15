import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/**/fixtures/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"], // re-exports only
      thresholds: {
        statements: 100,
        branches: 98,
        functions: 100,
        lines: 100,
      },
    },
  },
});
