import { describe, expect, it } from "vitest";
import type { Rule, RuleWarning } from "../types.js";
import { generateHTML } from "./html.js";

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

describe("generateHTML", () => {
  it("produces valid HTML structure for empty rules", () => {
    const html = generateHTML([], []);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
  });

  it('contains "Business Rules" heading for empty rules', () => {
    const html = generateHTML([], []);
    expect(html).toContain("Business Rules");
  });

  it('shows "0" in stats for empty rules', () => {
    const html = generateHTML([], []);
    // Stats section: <strong>0</strong>rules and <strong>0</strong>scopes
    expect(html).toContain("<strong>0</strong>rules");
    expect(html).toContain("<strong>0</strong>scopes");
  });

  it("escapes HTML entities in rule descriptions", () => {
    const rules = [makeRule({ description: '<script>alert("xss")</script>' })];
    const html = generateHTML(rules, []);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("escapes ampersands in descriptions", () => {
    const rules = [makeRule({ description: "A & B" })];
    const html = generateHTML(rules, []);
    expect(html).toContain("A &amp; B");
  });

  it("shows critical badge and count in stats when critical rules exist", () => {
    const rules = [
      makeRule({ severity: "critical", description: "c1" }),
      makeRule({ severity: "critical", description: "c2" }),
    ];
    const html = generateHTML(rules, []);
    // Critical stat in stats section
    expect(html).toContain("<strong>2</strong>critical");
    expect(html).toContain('style="border-left:3px solid #ef4444"');
    // Critical badge on scope heading
    expect(html).toContain("2 critical</span>");
    expect(html).toContain('class="badge critical"');
  });

  it("shows warning count in stats when warning rules exist", () => {
    const rules = [makeRule({ severity: "warning", description: "w1" })];
    const html = generateHTML(rules, []);
    expect(html).toContain("<strong>1</strong>warning");
    expect(html).toContain('style="border-left:3px solid #eab308"');
  });

  it("does not show critical/warning stats when none exist", () => {
    const rules = [makeRule({ severity: "info" })];
    const html = generateHTML(rules, []);
    expect(html).not.toContain("border-left:3px solid #ef4444");
    expect(html).not.toContain("border-left:3px solid #eab308");
  });

  it("generates scope filter buttons", () => {
    const rules = [
      makeRule({ scope: "billing", fullScope: "billing" }),
      makeRule({ scope: "auth", fullScope: "auth", description: "auth rule" }),
    ];
    const html = generateHTML(rules, []);
    expect(html).toContain('data-filter="all"');
    expect(html).toContain('data-filter="billing"');
    expect(html).toContain('data-filter="auth"');
    expect(html).toContain("All (2)");
  });

  it("generates severity filter buttons", () => {
    const html = generateHTML([], []);
    expect(html).toContain('data-sev="all"');
    expect(html).toContain('data-sev="critical"');
    expect(html).toContain('data-sev="warning"');
    expect(html).toContain('data-sev="info"');
    expect(html).toContain("All severities");
  });

  it("generates search input", () => {
    const html = generateHTML([], []);
    expect(html).toContain('id="search"');
    expect(html).toContain('placeholder="Search rules..."');
    expect(html).toContain("search-bar");
  });

  it("rules have correct data-severity and data-scope attributes", () => {
    const rules = [makeRule({ severity: "critical", fullScope: "billing.plans" })];
    const html = generateHTML(rules, []);
    expect(html).toContain('data-severity="critical"');
    expect(html).toContain('data-scope="billing.plans"');
  });

  it("shows tickets as code elements when present", () => {
    const rules = [makeRule({ ticket: "FLEW-123" })];
    const html = generateHTML(rules, []);
    expect(html).toContain('class="ticket"');
    expect(html).toContain("FLEW-123</code>");
  });

  it("does not show ticket element when ticket is empty", () => {
    const rules = [makeRule({ ticket: "" })];
    const html = generateHTML(rules, []);
    expect(html).not.toContain('class="ticket"');
  });

  it("shows code context when present", () => {
    const rules = [makeRule({ codeContext: "const x = 42;" })];
    const html = generateHTML(rules, []);
    expect(html).toContain('class="rule-code"');
    expect(html).toContain("const x = 42;");
  });

  it("does not show code context div when empty", () => {
    const rules = [makeRule({ codeContext: "" })];
    const html = generateHTML(rules, []);
    // The CSS contains ".rule-code" but the actual rule div should not have it
    const rulesSection = html.slice(html.indexOf('id="rules"'));
    expect(rulesSection).not.toContain('class="rule-code"');
  });

  it("shows warnings section when warnings exist", () => {
    const warnings: RuleWarning[] = [{ file: "foo.ts", line: 10, message: "bad thing" }];
    const html = generateHTML([], warnings);
    expect(html).toContain("warnings-section");
    expect(html).toContain("Warnings (1)");
    expect(html).toContain("foo.ts:10");
    expect(html).toContain("bad thing");
  });

  it("does not show warnings section when empty", () => {
    const html = generateHTML([], []);
    // The CSS defines .warnings-section but the actual content should not have it
    // Check that no warnings-section div is generated (it would be a <div class="warnings-section">)
    expect(html).not.toContain('<div class="warnings-section">');
  });

  it("escapes HTML in warning messages", () => {
    const warnings: RuleWarning[] = [{ file: "a.ts", line: 1, message: '<img onerror="hack">' }];
    const html = generateHTML([], warnings);
    expect(html).toContain("&lt;img onerror=&quot;hack&quot;&gt;");
  });

  it("contains script tag with filter logic", () => {
    const html = generateHTML([], []);
    expect(html).toContain("<script>");
    expect(html).toContain("</script>");
    expect(html).toContain("filter");
    expect(html).toContain("addEventListener");
  });

  it("footer contains ruledoc", () => {
    const html = generateHTML([], []);
    expect(html).toContain("<footer>");
    expect(html).toContain("ruledoc");
  });

  it("does not generate h3 for _general subscope", () => {
    const rules = [makeRule({ subscope: "_general" })];
    const html = generateHTML(rules, []);
    expect(html).not.toContain("<h3>General</h3>");
  });

  it("generates h3 for named subscopes", () => {
    const rules = [makeRule({ subscope: "plans", fullScope: "billing.plans" })];
    const html = generateHTML(rules, []);
    expect(html).toContain("<h3>Plans</h3>");
  });

  it("does not show severity tag for info rules", () => {
    const rules = [makeRule({ severity: "info" })];
    const html = generateHTML(rules, []);
    // CSS has .sev-tag but the actual rule content should not use it
    const rulesSection = html.slice(html.indexOf('id="rules"'));
    expect(rulesSection).not.toContain('class="sev-tag"');
  });

  it("shows severity tag for non-info rules", () => {
    const rules = [makeRule({ severity: "warning" })];
    const html = generateHTML(rules, []);
    expect(html).toContain("sev-tag");
    expect(html).toContain("[warning]");
  });

  it("uses correct colors for severity dots", () => {
    const rules = [
      makeRule({ severity: "critical", description: "c rule" }),
      makeRule({ severity: "warning", description: "w rule" }),
      makeRule({ severity: "info", description: "i rule" }),
    ];
    const html = generateHTML(rules, []);
    expect(html).toContain('background:#ef4444"');
    expect(html).toContain('background:#eab308"');
    expect(html).toContain('background:#3b82f6"');
  });

  it("uses fallback color for unknown severity", () => {
    const rules = [makeRule({ severity: "custom" })];
    const html = generateHTML(rules, []);
    expect(html).toContain('background:#9ca3af"');
  });

  it("uses severity as label for unknown severity", () => {
    const rules = [makeRule({ severity: "custom" })];
    const html = generateHTML(rules, []);
    expect(html).toContain('title="custom"');
  });

  it("uses known labels for known severities", () => {
    const rules = [
      makeRule({ severity: "critical", description: "c" }),
      makeRule({ severity: "warning", description: "w" }),
      makeRule({ severity: "info", description: "i" }),
    ];
    const html = generateHTML(rules, []);
    expect(html).toContain('title="Critical"');
    expect(html).toContain('title="Warning"');
    expect(html).toContain('title="Info"');
  });

  it("shows file location in rule meta", () => {
    const rules = [makeRule({ file: "src/billing.ts", line: 42 })];
    const html = generateHTML(rules, []);
    expect(html).toContain("rule-meta");
    expect(html).toContain("src/billing.ts:42");
  });

  it("scope filter buttons include correct counts", () => {
    const rules = [
      makeRule({ scope: "billing", description: "r1" }),
      makeRule({ scope: "billing", description: "r2" }),
      makeRule({ scope: "auth", fullScope: "auth", description: "r3" }),
    ];
    const html = generateHTML(rules, []);
    expect(html).toContain("Billing (2)");
    expect(html).toContain("Auth (1)");
  });

  it("escapes scope names in data attributes", () => {
    const rules = [makeRule({ scope: 'a"b', fullScope: 'a"b' })];
    const html = generateHTML(rules, []);
    expect(html).toContain('data-scope="a&quot;b"');
  });

  it("has no critical badge on scope heading when no critical rules", () => {
    const rules = [makeRule({ severity: "info" })];
    const html = generateHTML(rules, []);
    expect(html).not.toContain('class="badge critical"');
  });
});
