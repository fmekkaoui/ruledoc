import { describe, expect, it } from "vitest";
import type { Rule, RuleWarning } from "../types.js";
import { generateMarkdown } from "./markdown.js";

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

describe("generateMarkdown", () => {
  it("produces header and 0 rules for empty input", () => {
    const md = generateMarkdown([], []);
    expect(md).toContain("# Business Rules");
    expect(md).toContain("0 rules");
    expect(md).toContain("0 scopes");
  });

  it("generates TOC, summary table, and detail section for a single rule", () => {
    const rules = [makeRule({ description: "Plan limit applies" })];
    const md = generateMarkdown(rules, []);

    // TOC
    expect(md).toContain("## Table of contents");
    expect(md).toContain("[**Billing**](#billing)");
    expect(md).toContain("(1)");

    // Summary table
    expect(md).toContain("## Summary");
    expect(md).toContain("| Billing | General | 1 |");

    // Detail section
    expect(md).toContain("## Billing");
    expect(md).toContain("Plan limit applies");
  });

  it("sorts multiple scopes alphabetically", () => {
    const rules = [
      makeRule({ scope: "zeta", fullScope: "zeta", description: "z rule" }),
      makeRule({ scope: "alpha", fullScope: "alpha", description: "a rule" }),
    ];
    const md = generateMarkdown(rules, []);
    const alphaIdx = md.indexOf("Alpha");
    const zetaIdx = md.indexOf("Zeta");
    expect(alphaIdx).toBeLessThan(zetaIdx);
  });

  it('does not generate h3 heading for "_general" subscope', () => {
    const rules = [makeRule({ subscope: "_general" })];
    const md = generateMarkdown(rules, []);
    expect(md).not.toContain("### General");
  });

  it("generates h3 heading for named subscopes", () => {
    const rules = [makeRule({ subscope: "plans", fullScope: "billing.plans", description: "sub rule" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("### Plans");
  });

  it("shows critical rules banner when critical rules exist", () => {
    const rules = [
      makeRule({ severity: "critical", description: "critical thing" }),
      makeRule({ severity: "critical", description: "another critical" }),
    ];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("⚠️ **2 critical rules**");
  });

  it("shows singular critical banner for 1 critical rule", () => {
    const rules = [makeRule({ severity: "critical", description: "one critical" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("⚠️ **1 critical rule**");
  });

  it("does not show critical banner when no critical rules", () => {
    const rules = [makeRule({ severity: "info" })];
    const md = generateMarkdown(rules, []);
    expect(md).not.toContain("critical rule");
  });

  it("shows severity badge in output", () => {
    const rules = [makeRule({ severity: "critical" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("🔴");
  });

  it("shows info severity badge", () => {
    const rules = [makeRule({ severity: "info" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("🔵");
  });

  it("shows warning severity badge", () => {
    const rules = [makeRule({ severity: "warning" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("🟡");
  });

  it("shows ticket as backtick-code when present", () => {
    const rules = [makeRule({ ticket: "FLEW-123" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("`FLEW-123`");
  });

  it("does not show ticket backtick when ticket is empty", () => {
    const rules = [makeRule({ ticket: "" })];
    const md = generateMarkdown(rules, []);
    // The rule line should not have trailing backtick code
    const lines = md.split("\n");
    const ruleLine = lines.find((l) => l.includes("test rule"));
    expect(ruleLine).not.toContain("``");
  });

  it("shows code context when present", () => {
    const rules = [makeRule({ codeContext: "const x = 42;" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("`const x = 42;`");
  });

  it("does not show code context line when empty", () => {
    const rules = [makeRule({ codeContext: "" })];
    const md = generateMarkdown(rules, []);
    const lines = md.split("\n");
    // After the 📍 line, there should not be another <br>` line
    const locLineIdx = lines.findIndex((l) => l.includes("📍"));
    expect(locLineIdx).toBeGreaterThan(-1);
    expect(lines[locLineIdx + 1]).not.toContain("<br>`");
  });

  it("shows file location with 📍", () => {
    const rules = [makeRule({ file: "src/billing.ts", line: 42 })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("📍 `src/billing.ts:42`");
  });

  it("shows warnings section when warnings exist", () => {
    const warnings: RuleWarning[] = [{ file: "foo.ts", line: 10, message: "bad annotation" }];
    const md = generateMarkdown([], warnings);
    expect(md).toContain("## ⚠️ Warnings");
    expect(md).toContain("`foo.ts:10`");
    expect(md).toContain("bad annotation");
  });

  it("does not show warnings section when warnings is empty", () => {
    const md = generateMarkdown([], []);
    expect(md).not.toContain("Warnings");
  });

  it('uses "1 issue" for single warning (singular)', () => {
    const warnings: RuleWarning[] = [{ file: "a.ts", line: 1, message: "oops" }];
    const md = generateMarkdown([], warnings);
    expect(md).toContain("1 issue found");
  });

  it('uses "2 issues" for multiple warnings (plural)', () => {
    const warnings: RuleWarning[] = [
      { file: "a.ts", line: 1, message: "oops1" },
      { file: "b.ts", line: 2, message: "oops2" },
    ];
    const md = generateMarkdown([], warnings);
    expect(md).toContain("2 issues found");
  });

  it("shows severity tag for non-info rules", () => {
    const rules = [makeRule({ severity: "warning", description: "warn me" })];
    const md = generateMarkdown(rules, []);
    expect(md).toContain("**[warning]**");
  });

  it("does not show severity tag for info rules", () => {
    const rules = [makeRule({ severity: "info", description: "info rule" })];
    const md = generateMarkdown(rules, []);
    expect(md).not.toContain("**[info]**");
  });

  it("shows red and yellow counts in summary table", () => {
    const rules = [
      makeRule({ severity: "critical", description: "c1" }),
      makeRule({ severity: "warning", description: "w1" }),
      makeRule({ severity: "info", description: "i1" }),
    ];
    const md = generateMarkdown(rules, []);
    // summary table should have 🔴 and 🟡 columns
    expect(md).toContain("🔴");
    expect(md).toContain("🟡");
  });

  it("shows dash for zero critical/warning in summary table", () => {
    const rules = [makeRule({ severity: "info" })];
    const md = generateMarkdown(rules, []);
    // The summary row for info-only should have — for both critical and warning
    expect(md).toContain("| — | — |");
  });

  it("includes auto-generated comment", () => {
    const md = generateMarkdown([], []);
    expect(md).toContain("AUTO-GENERATED by ruledoc");
  });

  it("TOC shows subscope counts separately from scope count", () => {
    const rules = [
      makeRule({ subscope: "_general", description: "r1" }),
      makeRule({ subscope: "plans", fullScope: "billing.plans", description: "r2" }),
      makeRule({ subscope: "plans", fullScope: "billing.plans", description: "r3" }),
    ];
    const md = generateMarkdown(rules, []);
    // Scope count = 3 total
    expect(md).toContain("[**Billing**](#billing) (3)");
    // Subscope count
    expect(md).toContain("[Plans](#billingplans) (2)");
  });
});
