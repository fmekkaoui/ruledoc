import { describe, expect, it } from "vitest";
import { ACTIVE_STATUSES, buildPattern, DEFAULT_CONFIG, DEFAULT_SEVERITIES, HISTORICAL_STATUSES, isHistoricalRule, VALID_STATUSES } from "./types.js";
import type { Rule } from "./types.js";

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "",
    scope: "billing",
    subscope: "_general",
    fullScope: "billing",
    severity: "info",
    ticket: "",
    description: "test rule",
    file: "test.ts",
    line: 1,
    codeContext: "",
    title: "",
    rationale: "",
    owner: "",
    status: "",
    since: "",
    tags: [],
    links: [],
    supersededBy: "",
    dependsOn: [],
    conflictsWith: [],
    examples: [],
    testCases: [],
    ...overrides,
  };
}

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
      extraIgnore: [],
      ignoreTests: true,
      gitignore: true,
      idPrefix: "RUL",
      idRequired: true,
    });
  });
});

describe("VALID_STATUSES", () => {
  it("contains the expected lifecycle statuses", () => {
    expect(VALID_STATUSES).toEqual(["draft", "proposed", "approved", "active", "deprecated", "removed"]);
  });
});

describe("ACTIVE_STATUSES", () => {
  it("contains draft, proposed, approved, active, and empty string", () => {
    expect(ACTIVE_STATUSES.has("draft")).toBe(true);
    expect(ACTIVE_STATUSES.has("proposed")).toBe(true);
    expect(ACTIVE_STATUSES.has("approved")).toBe(true);
    expect(ACTIVE_STATUSES.has("active")).toBe(true);
    expect(ACTIVE_STATUSES.has("")).toBe(true);
    expect(ACTIVE_STATUSES.has("deprecated")).toBe(false);
    expect(ACTIVE_STATUSES.has("removed")).toBe(false);
  });
});

describe("HISTORICAL_STATUSES", () => {
  it("contains deprecated and removed", () => {
    expect(HISTORICAL_STATUSES.has("deprecated")).toBe(true);
    expect(HISTORICAL_STATUSES.has("removed")).toBe(true);
    expect(HISTORICAL_STATUSES.has("active")).toBe(false);
    expect(HISTORICAL_STATUSES.has("")).toBe(false);
  });
});

describe("isHistoricalRule", () => {
  it("returns true for deprecated status", () => {
    expect(isHistoricalRule(makeRule({ status: "deprecated" }))).toBe(true);
  });

  it("returns true for removed status", () => {
    expect(isHistoricalRule(makeRule({ status: "removed" }))).toBe(true);
  });

  it("returns true when supersededBy is set", () => {
    expect(isHistoricalRule(makeRule({ supersededBy: "other-rule" }))).toBe(true);
  });

  it("returns true when supersededBy is set even with active status", () => {
    expect(isHistoricalRule(makeRule({ status: "active", supersededBy: "other-rule" }))).toBe(true);
  });

  it("returns false for active status", () => {
    expect(isHistoricalRule(makeRule({ status: "active" }))).toBe(false);
  });

  it("returns false for empty status", () => {
    expect(isHistoricalRule(makeRule({ status: "" }))).toBe(false);
  });

  it("returns false for draft status", () => {
    expect(isHistoricalRule(makeRule({ status: "draft" }))).toBe(false);
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
