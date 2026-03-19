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
});
