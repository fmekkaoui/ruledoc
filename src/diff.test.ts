import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appendHistory, computeDiff, loadHistory, loadPreviousRules } from "./diff.js";
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

const tmpDir = mkdtempSync(join(tmpdir(), "ruledoc-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadPreviousRules", () => {
  it("returns [] for non-existent file", () => {
    expect(loadPreviousRules(join(tmpDir, "nope.json"))).toEqual([]);
  });

  it("returns [] for invalid JSON file", () => {
    const file = join(tmpDir, "invalid.json");
    writeFileSync(file, "not json at all{{{");
    expect(loadPreviousRules(file)).toEqual([]);
  });

  it("returns [] for JSON without rules field", () => {
    const file = join(tmpDir, "no-rules.json");
    writeFileSync(file, JSON.stringify({ version: 1 }));
    expect(loadPreviousRules(file)).toEqual([]);
  });

  it("returns rules from valid JSON file", () => {
    const rules = [makeRule({ description: "persisted rule" })];
    const file = join(tmpDir, "valid.json");
    writeFileSync(file, JSON.stringify({ rules }));
    const result = loadPreviousRules(file);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("persisted rule");
  });
});

describe("computeDiff", () => {
  it("returns empty diff for empty arrays", () => {
    expect(computeDiff([], [])).toEqual({ added: [], removed: [] });
  });

  it("detects added rules", () => {
    const added = makeRule({ description: "new rule" });
    const diff = computeDiff([], [added]);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].description).toBe("new rule");
    expect(diff.removed).toHaveLength(0);
  });

  it("detects removed rules", () => {
    const removed = makeRule({ description: "old rule" });
    const diff = computeDiff([removed], []);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].description).toBe("old rule");
    expect(diff.added).toHaveLength(0);
  });

  it("returns empty diff for identical sets", () => {
    const rule = makeRule();
    const diff = computeDiff([rule], [rule]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("handles mixed changes", () => {
    const kept = makeRule({ description: "kept" });
    const removed = makeRule({ description: "removed" });
    const added = makeRule({ description: "added" });
    const diff = computeDiff([kept, removed], [kept, added]);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].description).toBe("added");
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].description).toBe("removed");
  });
});

describe("loadHistory", () => {
  it("returns [] for non-existent file", () => {
    expect(loadHistory(join(tmpDir, "no-history.json"))).toEqual([]);
  });

  it("returns [] for invalid JSON", () => {
    const file = join(tmpDir, "bad-history.json");
    writeFileSync(file, "not json");
    expect(loadHistory(file)).toEqual([]);
  });

  it("returns [] for non-array JSON", () => {
    const file = join(tmpDir, "obj-history.json");
    writeFileSync(file, JSON.stringify({ entries: [] }));
    expect(loadHistory(file)).toEqual([]);
  });

  it("returns entries from valid history file", () => {
    const file = join(tmpDir, "valid-history.json");
    const entries = [
      {
        removedAt: "2026-01-01T00:00:00.000Z",
        rule: { scope: "billing", severity: "info", description: "test", lastFile: "a.ts", lastLine: 1 },
      },
    ];
    writeFileSync(file, JSON.stringify(entries));
    expect(loadHistory(file)).toEqual(entries);
  });
});

describe("appendHistory", () => {
  it("creates history file on first removal", () => {
    const file = join(tmpDir, "new-history.json");
    expect(existsSync(file)).toBe(false);

    const removed = [
      makeRule({
        description: "gone rule",
        fullScope: "billing.plans",
        severity: "critical",
        file: "plans.ts",
        line: 42,
      }),
    ];
    const result = appendHistory(file, removed);

    expect(existsSync(file)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].rule.description).toBe("gone rule");
    expect(result[0].rule.scope).toBe("billing.plans");
    expect(result[0].rule.severity).toBe("critical");
    expect(result[0].rule.lastFile).toBe("plans.ts");
    expect(result[0].rule.lastLine).toBe(42);
    expect(result[0].removedAt).toBeTruthy();
  });

  it("populates acknowledged field when removal matches", () => {
    const file = join(tmpDir, "ack-history.json");
    const removed = [
      makeRule({
        description: "ack rule",
        fullScope: "billing.plans",
        severity: "critical",
        file: "plans.ts",
        line: 42,
      }),
    ];
    const removals = [{ scope: "billing.plans", ticket: "JIRA-456", reason: "Migrated", file: "plans.ts", line: 10 }];
    const result = appendHistory(file, removed, removals);
    expect(result).toHaveLength(1);
    expect(result[0].acknowledged).toEqual({
      ticket: "JIRA-456",
      reason: "Migrated",
      file: "plans.ts",
      line: 10,
    });
  });

  it("does not set acknowledged when no removal matches", () => {
    const file = join(tmpDir, "no-ack-history.json");
    const removed = [makeRule({ description: "no ack", fullScope: "auth.session" })];
    const result = appendHistory(file, removed);
    expect(result).toHaveLength(1);
    expect(result[0].acknowledged).toBeUndefined();
  });

  it("uses first removal when multiple removals share the same scope", () => {
    const file = join(tmpDir, "dup-scope-history.json");
    const removed = [makeRule({ description: "dup test", fullScope: "billing.plans" })];
    const removals = [
      { scope: "billing.plans", ticket: "JIRA-1", reason: "First", file: "a.ts", line: 1 },
      { scope: "billing.plans", ticket: "JIRA-2", reason: "Second", file: "b.ts", line: 2 },
    ];
    const result = appendHistory(file, removed, removals);
    expect(result).toHaveLength(1);
    expect(result[0].acknowledged?.ticket).toBe("JIRA-1");
    expect(result[0].acknowledged?.reason).toBe("First");
  });

  it("appends to existing history", () => {
    const file = join(tmpDir, "append-history.json");
    const existing = [
      {
        removedAt: "2026-01-01T00:00:00.000Z",
        rule: { scope: "auth", severity: "info", description: "old", lastFile: "a.ts", lastLine: 1 },
      },
    ];
    writeFileSync(file, JSON.stringify(existing));

    const removed = [makeRule({ description: "new removal" })];
    const result = appendHistory(file, removed);

    expect(result).toHaveLength(2);
    expect(result[0].rule.description).toBe("old");
    expect(result[1].rule.description).toBe("new removal");

    // Verify file was written correctly
    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk).toHaveLength(2);
  });
});
