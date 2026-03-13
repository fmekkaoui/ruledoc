import { describe, expect, it } from "vitest";
import type { Rule, RuleWarning } from "../types.js";
import { generateJSON } from "./json.js";

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    scope: "billing",
    subscope: "_general",
    fullScope: "billing",
    severity: "info",
    ticket: "",
    description: "test rule",
    file: "test.ts",
    line: 1,
    codeContext: "",
    ...overrides,
  };
}

describe("generateJSON", () => {
  it("returns valid JSON for empty rules", () => {
    const json = generateJSON([], []);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("has total: 0 for empty rules", () => {
    const parsed = JSON.parse(generateJSON([], []));
    expect(parsed.total).toBe(0);
  });

  it("contains generated ISO timestamp", () => {
    const parsed = JSON.parse(generateJSON([], []));
    expect(parsed.generated).toBeDefined();
    // ISO 8601 format check
    expect(new Date(parsed.generated).toISOString()).toBe(parsed.generated);
  });

  it("contains total count matching rules length", () => {
    const rules = [makeRule(), makeRule({ description: "second" })];
    const parsed = JSON.parse(generateJSON(rules, []));
    expect(parsed.total).toBe(2);
  });

  it("contains tree with scope structure", () => {
    const rules = [
      makeRule({ scope: "billing", subscope: "_general" }),
      makeRule({ scope: "auth", subscope: "session", fullScope: "auth.session", description: "r2" }),
    ];
    const parsed = JSON.parse(generateJSON(rules, []));
    expect(parsed.tree).toBeDefined();
    expect(parsed.tree.billing).toBeDefined();
    expect(parsed.tree.billing._general).toHaveLength(1);
    expect(parsed.tree.auth).toBeDefined();
    expect(parsed.tree.auth.session).toHaveLength(1);
  });

  it("contains rules array", () => {
    const rules = [makeRule()];
    const parsed = JSON.parse(generateJSON(rules, []));
    expect(Array.isArray(parsed.rules)).toBe(true);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0].description).toBe("test rule");
  });

  it("includes warnings when non-empty", () => {
    const warnings: RuleWarning[] = [{ file: "foo.ts", line: 5, message: "bad" }];
    const parsed = JSON.parse(generateJSON([], warnings));
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0].message).toBe("bad");
  });

  it("omits warnings (undefined) when empty", () => {
    const parsed = JSON.parse(generateJSON([], []));
    expect(parsed.warnings).toBeUndefined();
  });

  it("output is pretty-printed with 2-space indent", () => {
    const json = generateJSON([], []);
    // Pretty-printed JSON has newlines and spaces
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });

  it("rules are nested in tree correctly for multiple subscopes", () => {
    const rules = [
      makeRule({ scope: "billing", subscope: "_general", description: "r1" }),
      makeRule({ scope: "billing", subscope: "plans", fullScope: "billing.plans", description: "r2" }),
    ];
    const parsed = JSON.parse(generateJSON(rules, []));
    expect(Object.keys(parsed.tree.billing).sort()).toEqual(["_general", "plans"]);
    expect(parsed.tree.billing._general[0].description).toBe("r1");
    expect(parsed.tree.billing.plans[0].description).toBe("r2");
  });
});
