import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRules } from "./parser.js";
import type { RuledocConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "parser-test-"));
}

function makeConfig(dir: string, overrides: Partial<RuledocConfig> = {}): RuledocConfig {
  return {
    ...DEFAULT_CONFIG,
    src: dir,
    idRequired: false,
    ...overrides,
  };
}

describe("extractRules", () => {
  const dirs: string[] = [];
  function tmp(): string {
    const d = makeTmp();
    dirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
    vi.restoreAllMocks();
  });

  it("returns empty results for empty directory", () => {
    const dir = tmp();
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("finds basic rule: // @rule(billing): Description", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): Must validate payment\nfunction pay() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].scope).toBe("billing");
    expect(result.rules[0].subscope).toBe("_general");
    expect(result.rules[0].fullScope).toBe("billing");
    expect(result.rules[0].description).toBe("Must validate payment");
    expect(result.rules[0].severity).toBe("info");
    expect(result.rules[0].ticket).toBe("");
  });

  it("finds rule with subscope: // @rule(billing.plans): Desc", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing.plans): Plan selection\nconst plans = [];\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].scope).toBe("billing");
    expect(result.rules[0].subscope).toBe("plans");
    expect(result.rules[0].fullScope).toBe("billing.plans");
  });

  it("finds rule with severity: // @rule(billing, critical): Desc", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, critical): Must not fail\nfunction charge() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].severity).toBe("critical");
    expect(result.rules[0].ticket).toBe("");
  });

  it("finds rule with ticket: // @rule(billing, TICK-123): Desc", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, TICK-123): Requires ticket\nfunction bill() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].ticket).toBe("TICK-123");
    expect(result.rules[0].severity).toBe("info"); // default
  });

  it("finds rule with ticket and severity in any order", () => {
    const dir = tmp();
    writeFileSync(join(dir, "a.ts"), `// @rule(billing, critical, TICK-1): A\nfunction a() {}\n`);
    writeFileSync(join(dir, "b.ts"), `// @rule(billing, TICK-2, warning): B\nfunction b() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(2);
    const ruleA = result.rules.find((r) => r.description === "A");
    const ruleB = result.rules.find((r) => r.description === "B");
    expect(ruleA).toBeDefined();
    expect(ruleB).toBeDefined();
    expect(ruleA.severity).toBe("critical");
    expect(ruleA.ticket).toBe("TICK-1");
    expect(ruleB.severity).toBe("warning");
    expect(ruleB.ticket).toBe("TICK-2");
  });

  it("captures code context (next non-comment line)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(auth): Login required\nfunction login() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules[0].codeContext).toBe("function login() {}");
  });

  it("skips comment lines for code context", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(auth): Check access",
        "// another comment",
        "# hash comment",
        "* star comment",
        "/** block start",
        "",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    // All following lines are comments or empty → no code context within the 4-line window
    expect(result.rules[0].codeContext).toBe("");
  });

  it("warns on empty scope", () => {
    const dir = tmp();
    // "unknown" scope triggers warning
    writeFileSync(join(dir, "test.ts"), `// @rule(unknown): Some desc\ncode();\n`);
    const result = extractRules(makeConfig(dir));
    const scopeWarning = result.warnings.find((w) => w.message.includes("empty scope"));
    expect(scopeWarning).toBeDefined();
  });

  it("warns on empty description and skips the rule", () => {
    const dir = tmp();
    // Need trailing space so .+? in regex matches, but trim() yields ""
    writeFileSync(join(dir, "test.ts"), "// @rule(billing):   \nfunction pay() {}\n");
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(0);
    const descWarning = result.warnings.find((w) => w.message.includes("empty description"));
    expect(descWarning).toBeDefined();
  });

  it("warns on misspelled severity with 'did you mean?'", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, critcal): Typo severity\nfunction x() {}\n`);
    const result = extractRules(makeConfig(dir));
    const typoWarning = result.warnings.find((w) => w.message.includes("did you mean"));
    expect(typoWarning).toBeDefined();
    expect(typoWarning?.message).toContain('"critical"');
    // Default severity is used instead
    expect(result.rules[0].severity).toBe("info");
  });

  it("does NOT treat ticket-like strings as typos (e.g. FLEW-102)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, FLEW-102): Has ticket\nfunction f() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules[0].ticket).toBe("FLEW-102");
    // No "did you mean?" warning
    const typoWarning = result.warnings.find((w) => w.message.includes("did you mean"));
    expect(typoWarning).toBeUndefined();
  });

  it("handles block comments: /** @rule(scope): desc */", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `/** @rule(auth): Block comment rule */\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].scope).toBe("auth");
    expect(result.rules[0].description).toBe("Block comment rule");
  });

  it("handles hash comments: # @rule(scope): desc", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.py"), `# @rule(data): Python rule\ndata = []\n`);
    const config = makeConfig(dir, { extensions: [".py"] });
    const result = extractRules(config);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].scope).toBe("data");
    expect(result.rules[0].description).toBe("Python rule");
  });

  it("silently skips files that can't be read", () => {
    const dir = tmp();
    writeFileSync(join(dir, "good.ts"), `// @rule(ok): Works\ncode();\n`);
    // Create a directory with .ts extension (readFileSync will fail on it)
    mkdirSync(join(dir, "bad.ts"));
    // walkFiles won't include bad.ts as a file since it's a directory
    // Instead, create a file and make it unreadable
    writeFileSync(join(dir, "unreadable.ts"), `// @rule(x): Y\nz();\n`, { mode: 0o000 });
    const result = extractRules(makeConfig(dir));
    // Should have the good rule, and silently skip the unreadable one
    expect(result.rules.length).toBeGreaterThanOrEqual(1);
    expect(result.rules.some((r) => r.scope === "ok")).toBe(true);
  });

  it("uses custom pattern when config.pattern is set", () => {
    const dir = tmp();
    // Custom pattern that matches "// BIZRULE(params): description"
    writeFileSync(join(dir, "test.ts"), `// BIZRULE(payments): Custom pattern\nfunction pay() {}\n`);
    const config = makeConfig(dir, {
      pattern: String.raw`(?:\/\/)\s*BIZRULE\(([^)]+)\)\s*:\s*(.+)$`,
    });
    const result = extractRules(config);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].scope).toBe("payments");
    expect(result.rules[0].description).toBe("Custom pattern");
  });

  it("verbose mode calls console.warn for walker errors via onSkip", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ok.ts"), `// @rule(x): Good\ncode();\n`);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // We need to trigger a walker skip. Create a dangling symlink.
    const { symlinkSync } = require("node:fs");
    symlinkSync(join(dir, "nonexistent"), join(dir, "broken-link.ts"));

    const config = makeConfig(dir, { verbose: true });
    extractRules(config);
    // The onSkip callback should have logged via console.warn
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("skipped"));
  });

  it("default severity is first in severities array", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): No severity specified\nfunction x() {}\n`);
    const config = makeConfig(dir, { severities: ["high", "medium", "low"] });
    const result = extractRules(config);
    expect(result.rules[0].severity).toBe("high");
  });

  it("handles empty scope part with fallback to 'unknown'", () => {
    const dir = tmp();
    // Empty scope: @rule(, critical): desc — parts[0] is "" → fallback to "unknown"
    writeFileSync(join(dir, "test.ts"), `// @rule(, critical): Empty scope\ncode();\n`);
    const result = extractRules(makeConfig(dir));
    // The scope warning should fire for "unknown"
    const scopeWarning = result.warnings.find((w) => w.message.includes("empty scope"));
    expect(scopeWarning).toBeDefined();
    expect(result.rules[0].fullScope).toBe("unknown");
  });

  it("defaults to 'info' when severities array is empty", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): No severity\nfunction x() {}\n`);
    // Empty severities — defaultSeverity falls back to "info" via || "info"
    const config = makeConfig(dir, { severities: [] });
    const result = extractRules(config);
    expect(result.rules[0].severity).toBe("info");
  });

  it("returns empty results for non-existent src directory", () => {
    const config = makeConfig("/no/such/directory/anywhere");
    const result = extractRules(config);
    expect(result.rules).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns empty removals by default", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): A rule\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toEqual([]);
  });

  it("extracts @rule-removed annotation from // comment", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      `// @rule-removed(billing.plans, JIRA-456): Migrated to config service\nconst x = 1;\n`,
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].scope).toBe("billing.plans");
    expect(result.removals[0].ticket).toBe("JIRA-456");
    expect(result.removals[0].reason).toBe("Migrated to config service");
  });

  it("extracts @rule-removed from block comment", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      `/** @rule-removed(auth.session, AUTH-99): No longer needed */\nconst x = 1;\n`,
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].scope).toBe("auth.session");
    expect(result.removals[0].ticket).toBe("AUTH-99");
    expect(result.removals[0].reason).toBe("No longer needed");
  });

  it("extracts @rule-removed with custom tag", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @brule-removed(billing, TICK-1): Gone\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir, { tag: "brule" }));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].scope).toBe("billing");
  });

  it("extracts multiple removals from same file", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule-removed(billing.plans, JIRA-1): Reason 1",
        "// @rule-removed(auth.session, JIRA-2): Reason 2",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(2);
  });

  it("finds annotation on last line with no trailing newline", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): Last line`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].description).toBe("Last line");
    expect(result.rules[0].codeContext).toBe("");
  });

  it("excludes test files by default (ignoreTests: true)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "app.ts"), `// @rule(billing): Real rule\nfunction pay() {}\n`);
    writeFileSync(join(dir, "app.test.ts"), `// @rule(billing): Test rule\ndescribe('', () => {});\n`);
    writeFileSync(join(dir, "app.spec.ts"), `// @rule(billing): Spec rule\ndescribe('', () => {});\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].description).toBe("Real rule");
  });

  it("includes test files when ignoreTests is false", () => {
    const dir = tmp();
    writeFileSync(join(dir, "app.ts"), `// @rule(billing): Real rule\nfunction pay() {}\n`);
    writeFileSync(join(dir, "app.test.ts"), `// @rule(billing): Test rule\ndescribe('', () => {});\n`);
    const result = extractRules(makeConfig(dir, { ignoreTests: false }));
    expect(result.rules).toHaveLength(2);
  });

  it("respects .gitignore when gitignore is true", () => {
    const dir = tmp();
    const srcDir = join(dir, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "app.ts"), `// @rule(billing): Keep\nconst x = 1;\n`);
    writeFileSync(join(srcDir, "generated.ts"), `// @rule(billing): Skip\nconst y = 2;\n`);
    writeFileSync(join(dir, ".gitignore"), "src/generated.ts\n");
    const result = extractRules(makeConfig(srcDir, { ignoreTests: false }), dir);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].description).toBe("Keep");
  });

  it("ignores .gitignore when gitignore is false", () => {
    const dir = tmp();
    const srcDir = join(dir, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "app.ts"), `// @rule(billing): Keep\nconst x = 1;\n`);
    writeFileSync(join(srcDir, "generated.ts"), `// @rule(billing): Also keep\nconst y = 2;\n`);
    writeFileSync(join(dir, ".gitignore"), "src/generated.ts\n");
    const result = extractRules(makeConfig(srcDir, { ignoreTests: false, gitignore: false }), dir);
    expect(result.rules).toHaveLength(2);
  });

  it("extraIgnore excludes matching files", () => {
    const dir = tmp();
    writeFileSync(join(dir, "app.ts"), `// @rule(billing): Keep\nconst x = 1;\n`);
    writeFileSync(join(dir, "generated.ts"), `// @rule(billing): Skip\nconst y = 2;\n`);
    const result = extractRules(makeConfig(dir, { ignoreTests: false, extraIgnore: ["**/generated.*"] }));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].description).toBe("Keep");
  });

  it("skips isIgnored when gitignore, ignoreTests, and extraIgnore are all off", () => {
    const dir = tmp();
    writeFileSync(join(dir, "app.ts"), `// @rule(billing): Keep\nconst x = 1;\n`);
    writeFileSync(join(dir, "app.test.ts"), `// @rule(billing): Test rule\ntest();\n`);
    const result = extractRules(makeConfig(dir, { gitignore: false, ignoreTests: false, extraIgnore: [] }));
    // Both files should be included (no filtering)
    expect(result.rules).toHaveLength(2);
  });

  it("parses continuation meta lines for title, rationale, owner, status, since", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing, critical): Plan limit applies",
        "// @title: Plan Limit",
        "// @rationale: Prevents abuse of free tier",
        "// @owner: billing-team",
        "// @status: active",
        "// @since: 2025-06-01",
        "const LIMIT = 50;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    const r = result.rules[0];
    expect(r.title).toBe("Plan Limit");
    expect(r.rationale).toBe("Prevents abuse of free tier");
    expect(r.owner).toBe("billing-team");
    expect(r.status).toBe("active");
    expect(r.since).toBe("2025-06-01");
    expect(r.codeContext).toBe("const LIMIT = 50;");
  });

  it("parses continuation meta lines for tags, links, dependsOn, conflictsWith", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing): Plan limit",
        "// @tags: billing, plans, limits",
        "// @links: https://docs.example.com/plans, https://wiki.example.com",
        "// @dependsOn: auth-rule-1, billing-rule-2",
        "// @conflictsWith: legacy-rule",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const r = result.rules[0];
    expect(r.tags).toEqual(["billing", "plans", "limits"]);
    expect(r.links).toEqual(["https://docs.example.com/plans", "https://wiki.example.com"]);
    expect(r.dependsOn).toEqual(["auth-rule-1", "billing-rule-2"]);
    expect(r.conflictsWith).toEqual(["legacy-rule"]);
  });

  it("parses supersededBy and testCases meta lines", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing): Old plan rule",
        "// @supersededBy: new-plan-rule",
        "// @testCases: test/billing.test.ts, test/plans.test.ts",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const r = result.rules[0];
    expect(r.supersededBy).toBe("new-plan-rule");
    expect(r.testCases).toEqual(["test/billing.test.ts", "test/plans.test.ts"]);
  });

  it("accumulates multiple examples lines", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing): Plan limit",
        "// @examples: Free plan allows 50 items",
        "// @examples: Pro plan allows 1000 items",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const r = result.rules[0];
    expect(r.examples).toEqual(["Free plan allows 50 items", "Pro plan allows 1000 items"]);
  });

  it("warns on unknown status", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing): Test rule",
        "// @status: invalid-status",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const statusWarning = result.warnings.find((w) => w.message.includes('unknown status'));
    expect(statusWarning).toBeDefined();
    expect(statusWarning?.message).toContain("invalid-status");
  });

  it("warns on malformed since date", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing): Test rule",
        "// @since: June 2025",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const dateWarning = result.warnings.find((w) => w.message.includes('malformed since date'));
    expect(dateWarning).toBeDefined();
    expect(dateWarning?.message).toContain("June 2025");
  });

  it("stops parsing meta on non-meta comment line", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing): Test rule",
        "// @title: My Title",
        "// This is a regular comment",
        "// @owner: should-not-be-parsed",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const r = result.rules[0];
    expect(r.title).toBe("My Title");
    expect(r.owner).toBe("");
  });

  it("parses meta from hash comments", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.py"),
      [
        "# @rule(data): Python rule",
        "# @title: Data Rule",
        "# @owner: data-team",
        "data = []",
      ].join("\n"),
    );
    const config = makeConfig(dir, { extensions: [".py"] });
    const result = extractRules(config);
    const r = result.rules[0];
    expect(r.title).toBe("Data Rule");
    expect(r.owner).toBe("data-team");
  });

  it("parses meta from block comment continuations", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "/** @rule(billing): Block rule",
        " * @title: Block Title",
        " * @owner: block-team",
        " */",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const r = result.rules[0];
    expect(r.title).toBe("Block Title");
    expect(r.owner).toBe("block-team");
  });

  it("defaults new meta fields to empty values when no continuation lines", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): Simple rule\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    const r = result.rules[0];
    expect(r.title).toBe("");
    expect(r.rationale).toBe("");
    expect(r.owner).toBe("");
    expect(r.status).toBe("");
    expect(r.since).toBe("");
    expect(r.tags).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.supersededBy).toBe("");
    expect(r.dependsOn).toEqual([]);
    expect(r.conflictsWith).toEqual([]);
    expect(r.examples).toEqual([]);
    expect(r.testCases).toEqual([]);
  });

  it("normalizes severity case to lowercase", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, CRITICAL): Uppercase severity\nfunction pay() {}\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].severity).toBe("critical");
  });

  it("warns on unreadable files", () => {
    const dir = tmp();
    writeFileSync(join(dir, "good.ts"), `// @rule(ok): Works\ncode();\n`);
    writeFileSync(join(dir, "unreadable.ts"), `// @rule(x): Y\nz();\n`, { mode: 0o000 });
    const result = extractRules(makeConfig(dir));
    expect(result.rules.some((r) => r.scope === "ok")).toBe(true);
    const readWarning = result.warnings.find((w) => w.message.includes("could not read file"));
    expect(readWarning).toBeDefined();
    expect(readWarning?.line).toBe(0);
  });

  it("warns and skips files exceeding 10 MB", () => {
    const dir = tmp();
    writeFileSync(join(dir, "big.ts"), "x".repeat(11 * 1024 * 1024));
    writeFileSync(join(dir, "ok.ts"), `// @rule(billing): Small file\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].description).toBe("Small file");
    const sizeWarning = result.warnings.find((w) => w.message.includes("exceeds 10 MB"));
    expect(sizeWarning).toBeDefined();
    expect(sizeWarning?.file).toBe("big.ts");
  });

  it("skips code context lines that start with comment markers", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(auth): Access check",
        "// This is a comment",
        "/** This is a block comment",
        "const authorized = true;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    expect(result.rules[0].codeContext).toBe("const authorized = true;");
  });

  it("parses rule ID from annotation (RUL-001)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, RUL-001): Has an ID\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe("RUL-001");
  });

  it("parses rule ID with custom prefix", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, BIZ-042): Custom prefix\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir, { idPrefix: "BIZ" }));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe("BIZ-042");
  });

  it("parses rule ID alongside severity and ticket", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, RUL-005, critical, TICK-1): Full params\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules[0].id).toBe("RUL-005");
    expect(result.rules[0].severity).toBe("critical");
    expect(result.rules[0].ticket).toBe("TICK-1");
  });

  it("defaults id to empty string when no ID present", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): No ID\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules[0].id).toBe("");
  });

  it("warns on missing required rule ID when idRequired is true", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): No ID here\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir, { idRequired: true }));
    const idWarning = result.warnings.find((w) => w.message.includes("missing required rule ID"));
    expect(idWarning).toBeDefined();
  });

  it("does not warn on missing ID when idRequired is false", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing): No ID here\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir, { idRequired: false }));
    const idWarning = result.warnings.find((w) => w.message.includes("missing required rule ID"));
    expect(idWarning).toBeUndefined();
  });

  it("warns on duplicate rule IDs", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing, RUL-001): First rule",
        "const a = 1;",
        "// @rule(auth, RUL-001): Duplicate ID",
        "const b = 2;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const dupWarning = result.warnings.find((w) => w.message.includes('duplicate rule ID "RUL-001"'));
    expect(dupWarning).toBeDefined();
  });

  it("does not warn when IDs are unique", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing, RUL-001): First rule",
        "const a = 1;",
        "// @rule(auth, RUL-002): Second rule",
        "const b = 2;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const dupWarning = result.warnings.find((w) => w.message.includes("duplicate rule ID"));
    expect(dupWarning).toBeUndefined();
  });

  it("uppercases rule IDs during parsing", () => {
    const dir = tmp();
    writeFileSync(join(dir, "test.ts"), `// @rule(billing, rul-001): Lowercase ID\nconst x = 1;\n`);
    const result = extractRules(makeConfig(dir));
    expect(result.rules[0].id).toBe("RUL-001");
  });

  it("extracts ID-based @rule-removed annotation", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      `// @rule-removed(RUL-001, JIRA-456): Migrated to config service\nconst x = 1;\n`,
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].id).toBe("RUL-001");
    expect(result.removals[0].scope).toBe("");
    expect(result.removals[0].ticket).toBe("JIRA-456");
    expect(result.removals[0].reason).toBe("Migrated to config service");
  });

  it("extracts scope-based @rule-removed annotation (backward compat)", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      `// @rule-removed(billing.plans, JIRA-456): Migrated\nconst x = 1;\n`,
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].id).toBe("");
    expect(result.removals[0].scope).toBe("billing.plans");
    expect(result.removals[0].ticket).toBe("JIRA-456");
  });

  it("@rule-removed works with scope-based matching (backward compat)", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      `// @rule-removed(billing.plans, JIRA-456): Migrated\nconst x = 1;\n`,
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].scope).toBe("billing.plans");
  });

  it("warns on dependsOn referencing unknown rule ID", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing, RUL-001): A rule",
        "// @dependsOn: RUL-999",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const refWarning = result.warnings.find((w) => w.message.includes('dependsOn references unknown rule ID "RUL-999"'));
    expect(refWarning).toBeDefined();
  });

  it("warns on conflictsWith referencing unknown rule ID", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing, RUL-001): A rule",
        "// @conflictsWith: RUL-888",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const refWarning = result.warnings.find((w) => w.message.includes('conflictsWith references unknown rule ID "RUL-888"'));
    expect(refWarning).toBeDefined();
  });

  it("extracts @replacedBy continuation line from @rule-removed", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule-removed(RUL-001, JIRA-456): Migrated to new rule",
        "// @replacedBy: RUL-002",
        "// @rule(billing, RUL-002): New rule",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].replacedBy).toBe("RUL-002");
  });

  it("sets empty replacedBy when no @replacedBy continuation", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      `// @rule-removed(RUL-001, JIRA-456): Migrated\nconst x = 1;\n`,
    );
    const result = extractRules(makeConfig(dir));
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0].replacedBy).toBe("");
  });

  it("warns on supersededBy referencing unknown rule ID", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "test.ts"),
      [
        "// @rule(billing, RUL-001): A rule",
        "// @supersededBy: RUL-777",
        "const x = 1;",
      ].join("\n"),
    );
    const result = extractRules(makeConfig(dir));
    const refWarning = result.warnings.find((w) => w.message.includes('supersededBy references unknown rule ID "RUL-777"'));
    expect(refWarning).toBeDefined();
  });
});
