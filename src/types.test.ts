import { describe, expect, it } from "vitest";
import { buildPattern, DEFAULT_CONFIG, DEFAULT_SEVERITIES } from "./types.js";

describe("DEFAULT_SEVERITIES", () => {
  it("has correct values", () => {
    expect(DEFAULT_SEVERITIES).toEqual(["info", "warning", "critical"]);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has correct defaults for all fields", () => {
    expect(DEFAULT_CONFIG).toEqual({
      src: "./src",
      output: "./BUSINESS_RULES.md",
      formats: ["md", "json"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"],
      ignore: [
        "node_modules",
        ".next",
        ".nuxt",
        ".turbo",
        "dist",
        "build",
        ".git",
        "coverage",
        "__tests__",
        "__mocks__",
        ".output",
      ],
      tag: "rule",
      severities: DEFAULT_SEVERITIES,
      pattern: null,
      protect: [],
      allowRemoval: false,
      check: false,
      quiet: false,
      verbose: false,
      history: true,
    });
  });
});

describe("buildPattern", () => {
  it('returns correct regex pattern for "rule"', () => {
    const pattern = buildPattern("rule");
    expect(pattern).toBe(String.raw`(?:\/\/|\/\*\*?|#)\s*@rule\(([^)]+)\)\s*:?\s*(.+?)(?:\s*\*\/)?$`);
  });

  it("escapes special regex characters in the tag", () => {
    const pattern = buildPattern("rule+");
    expect(pattern).toContain("rule\\+");
  });

  it("result can be used as a valid RegExp", () => {
    const pattern = buildPattern("rule");
    expect(() => new RegExp(pattern)).not.toThrow();
  });

  it("matches // @rule(scope): description", () => {
    const re = new RegExp(buildPattern("rule"));
    const match = re.exec("// @rule(billing): Users must confirm");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("billing");
    expect(match?.[2]).toBe("Users must confirm");
  });

  it("matches /** @rule(scope): description */", () => {
    const re = new RegExp(buildPattern("rule"));
    const match = re.exec("/** @rule(billing.plans): Must validate */");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("billing.plans");
    expect(match?.[2]).toBe("Must validate");
  });

  it("matches # @rule(scope): description", () => {
    const re = new RegExp(buildPattern("rule"));
    const match = re.exec("# @rule(auth): Login required");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("auth");
    expect(match?.[2]).toBe("Login required");
  });

  it("matches /* single-star block comment */", () => {
    const re = new RegExp(buildPattern("rule"));
    const match = re.exec("/* @rule(payments): Charge once */");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("payments");
    expect(match?.[2]).toBe("Charge once");
  });
});
