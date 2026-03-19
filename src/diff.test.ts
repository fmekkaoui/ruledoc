import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { computeDiff, loadPreviousRules } from "./diff.js";
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
