import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadGitignore } from "./gitignore.js";

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "gitignore-test-"));
}

describe("loadGitignore", () => {
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
  });

  it("returns () => false when no .gitignore exists", () => {
    const dir = tmp();
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("foo.ts")).toBe(false);
    expect(isIgnored("node_modules/foo.ts")).toBe(false);
  });

  it("ignores files matching simple pattern", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "*.log\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("debug.log")).toBe(true);
    expect(isIgnored("src/app.log")).toBe(true);
    expect(isIgnored("app.ts")).toBe(false);
  });

  it("ignores directories", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("node_modules")).toBe(true);
    expect(isIgnored("node_modules/package/index.js")).toBe(true);
    expect(isIgnored("src/index.js")).toBe(false);
  });

  it("skips comments and blank lines", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "# This is a comment\n\n*.log\n\n# Another comment\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("debug.log")).toBe(true);
    expect(isIgnored("app.ts")).toBe(false);
  });

  it("supports negation with !", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "*.log\n!important.log\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("debug.log")).toBe(true);
    expect(isIgnored("important.log")).toBe(false);
  });

  it("last matching rule wins", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "*.log\n!important.log\n*.log\n");
    const isIgnored = loadGitignore(dir);
    // Last rule is *.log which re-ignores
    expect(isIgnored("important.log")).toBe(true);
  });

  it("handles ** patterns", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "**/dist\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("dist")).toBe(true);
    expect(isIgnored("packages/a/dist")).toBe(true);
    expect(isIgnored("src/index.ts")).toBe(false);
  });

  it("handles root-anchored patterns with leading /", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "/build\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("build")).toBe(true);
    expect(isIgnored("src/build")).toBe(false);
  });

  it("returns () => false for empty .gitignore", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "\n\n# only comments\n");
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("foo.ts")).toBe(false);
  });

  it("returns () => false when .gitignore is unreadable", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".gitignore"), "*.log\n", { mode: 0o000 });
    const isIgnored = loadGitignore(dir);
    expect(isIgnored("debug.log")).toBe(false);
    // Restore permissions for cleanup
    chmodSync(join(dir, ".gitignore"), 0o644);
  });
});
