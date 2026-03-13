import { describe, expect, it } from "vitest";
import { buildTree, capitalize, sevBadge } from "./tree.js";
import type { Rule } from "./types.js";

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

describe("buildTree", () => {
  it("returns {} for an empty array", () => {
    expect(buildTree([])).toEqual({});
  });

  it("groups rules by scope and subscope", () => {
    const rules = [
      makeRule({ scope: "billing", subscope: "_general", description: "r1" }),
      makeRule({ scope: "billing", subscope: "plans", description: "r2" }),
    ];
    const tree = buildTree(rules);
    expect(Object.keys(tree)).toEqual(["billing"]);
    expect(Object.keys(tree.billing)).toEqual(["_general", "plans"]);
    expect(tree.billing._general).toHaveLength(1);
    expect(tree.billing.plans).toHaveLength(1);
  });

  it("handles multiple scopes and subscopes", () => {
    const rules = [
      makeRule({ scope: "billing", subscope: "_general" }),
      makeRule({ scope: "billing", subscope: "plans" }),
      makeRule({ scope: "auth", subscope: "_general" }),
      makeRule({ scope: "auth", subscope: "sessions" }),
    ];
    const tree = buildTree(rules);
    expect(Object.keys(tree).sort()).toEqual(["auth", "billing"]);
    expect(Object.keys(tree.billing).sort()).toEqual(["_general", "plans"]);
    expect(Object.keys(tree.auth).sort()).toEqual(["_general", "sessions"]);
  });

  it("pushes multiple rules into the same subscope", () => {
    const rules = [makeRule({ description: "r1" }), makeRule({ description: "r2" })];
    const tree = buildTree(rules);
    expect(tree.billing._general).toHaveLength(2);
  });
});

describe("capitalize", () => {
  it('returns "General" for "_general"', () => {
    expect(capitalize("_general")).toBe("General");
  });

  it('returns "Billing" for "billing"', () => {
    expect(capitalize("billing")).toBe("Billing");
  });

  it('returns "A" for "a"', () => {
    expect(capitalize("a")).toBe("A");
  });
});

describe("sevBadge", () => {
  it('returns red circle for "critical"', () => {
    expect(sevBadge("critical")).toBe("🔴");
  });

  it('returns yellow circle for "warning"', () => {
    expect(sevBadge("warning")).toBe("🟡");
  });

  it('returns blue circle for "info"', () => {
    expect(sevBadge("info")).toBe("🔵");
  });

  it("returns white circle for unknown severity", () => {
    expect(sevBadge("unknown")).toBe("⚪");
  });
});
