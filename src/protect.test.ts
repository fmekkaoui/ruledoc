import { describe, expect, it } from "vitest";
import { checkProtection } from "./protect.js";
import type { Rule, RuleRemoval } from "./types.js";

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

function makeRemoval(overrides: Partial<RuleRemoval> = {}): RuleRemoval {
  return {
    id: "",
    scope: "billing",
    ticket: "JIRA-1",
    reason: "migrated",
    file: "test.ts",
    line: 1,
    ...overrides,
  };
}

describe("checkProtection", () => {
  it("returns empty results when no rules are protected", () => {
    const removed = [makeRule({ severity: "info" })];
    const result = checkProtection(removed, [], ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toEqual([]);
  });

  it("blocks protected rules without acknowledgment", () => {
    const removed = [makeRule({ severity: "critical", fullScope: "billing.plans" })];
    const result = checkProtection(removed, [], ["critical"]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].fullScope).toBe("billing.plans");
    expect(result.acknowledged).toEqual([]);
  });

  it("acknowledges protected rules with matching @rule-removed", () => {
    const removed = [makeRule({ severity: "critical", fullScope: "billing.plans" })];
    const removals = [makeRemoval({ scope: "billing.plans", ticket: "JIRA-456" })];
    const result = checkProtection(removed, removals, ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toHaveLength(1);
  });

  it("handles partial acknowledgment", () => {
    const removed = [
      makeRule({ severity: "critical", fullScope: "billing.plans", description: "plan rule" }),
      makeRule({ severity: "critical", fullScope: "billing.charges", description: "charge rule" }),
    ];
    const removals = [makeRemoval({ scope: "billing.plans" })];
    const result = checkProtection(removed, removals, ["critical"]);
    expect(result.acknowledged).toHaveLength(1);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].fullScope).toBe("billing.charges");
  });

  it("ignores non-protected severity levels", () => {
    const removed = [
      makeRule({ severity: "info", fullScope: "billing.info" }),
      makeRule({ severity: "warning", fullScope: "billing.warn" }),
      makeRule({ severity: "critical", fullScope: "billing.crit" }),
    ];
    const result = checkProtection(removed, [], ["critical"]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].fullScope).toBe("billing.crit");
  });

  it("supports multiple protected severities", () => {
    const removed = [
      makeRule({ severity: "warning", fullScope: "billing.warn" }),
      makeRule({ severity: "critical", fullScope: "billing.crit" }),
      makeRule({ severity: "info", fullScope: "billing.info" }),
    ];
    const result = checkProtection(removed, [], ["critical", "warning"]);
    expect(result.blocked).toHaveLength(2);
  });

  it("returns empty results when removed list is empty", () => {
    const result = checkProtection([], [], ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toEqual([]);
  });

  it("matches subscope removal to rule with matching fullScope", () => {
    const removed = [makeRule({ severity: "critical", fullScope: "billing.plans" })];
    const removals = [makeRemoval({ scope: "billing.plans" })];
    const result = checkProtection(removed, removals, ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toHaveLength(1);
  });

  it("acknowledges protected rules by ID-based removal", () => {
    const removed = [makeRule({ id: "RUL-001", severity: "critical", fullScope: "billing.plans" })];
    const removals = [makeRemoval({ id: "RUL-001", scope: "", ticket: "JIRA-789" })];
    const result = checkProtection(removed, removals, ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toHaveLength(1);
  });

  it("prefers ID-based match over scope-based match", () => {
    const removed = [makeRule({ id: "RUL-001", severity: "critical", fullScope: "billing.plans" })];
    const removals = [
      makeRemoval({ id: "RUL-001", scope: "", ticket: "ID-TICKET" }),
      makeRemoval({ id: "", scope: "billing.plans", ticket: "SCOPE-TICKET" }),
    ];
    const result = checkProtection(removed, removals, ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toHaveLength(1);
  });

  it("uses first removal when duplicate @rule-removed for same scope", () => {
    const removed = [makeRule({ severity: "critical", fullScope: "billing.plans" })];
    const removals = [
      makeRemoval({ scope: "billing.plans", ticket: "FIRST-1" }),
      makeRemoval({ scope: "billing.plans", ticket: "SECOND-2" }),
    ];
    const result = checkProtection(removed, removals, ["critical"]);
    expect(result.blocked).toEqual([]);
    expect(result.acknowledged).toHaveLength(1);
  });
});
