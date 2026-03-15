import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { walkFiles } from "./walker.js";

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "walker-test-"));
}

describe("walkFiles", () => {
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

  it("returns [] for non-existent directory", () => {
    const result = walkFiles("/no/such/dir", new Set([".ts"]), new Set());
    expect(result).toEqual([]);
  });

  it("finds files with matching extensions", () => {
    const dir = tmp();
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "b.tsx"), "");
    const result = walkFiles(dir, new Set([".ts", ".tsx"]), new Set());
    expect(result).toContain(join(dir, "a.ts"));
    expect(result).toContain(join(dir, "b.tsx"));
    expect(result).toHaveLength(2);
  });

  it("ignores files with non-matching extensions", () => {
    const dir = tmp();
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "b.css"), "");
    const result = walkFiles(dir, new Set([".ts"]), new Set());
    expect(result).toEqual([join(dir, "a.ts")]);
  });

  it("ignores directories in the ignored set", () => {
    const dir = tmp();
    const sub = join(dir, "node_modules");
    mkdirSync(sub);
    writeFileSync(join(sub, "a.ts"), "");
    writeFileSync(join(dir, "b.ts"), "");
    const result = walkFiles(dir, new Set([".ts"]), new Set(["node_modules"]));
    expect(result).toEqual([join(dir, "b.ts")]);
  });

  it("ignores dotfiles and dotdirs", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".hidden.ts"), "");
    const dotDir = join(dir, ".git");
    mkdirSync(dotDir);
    writeFileSync(join(dotDir, "config.ts"), "");
    writeFileSync(join(dir, "visible.ts"), "");
    const result = walkFiles(dir, new Set([".ts"]), new Set());
    expect(result).toEqual([join(dir, "visible.ts")]);
  });

  it("recurses into subdirectories", () => {
    const dir = tmp();
    const sub = join(dir, "lib");
    mkdirSync(sub);
    writeFileSync(join(sub, "deep.ts"), "");
    writeFileSync(join(dir, "top.ts"), "");
    const result = walkFiles(dir, new Set([".ts"]), new Set());
    expect(result).toContain(join(dir, "top.ts"));
    expect(result).toContain(join(sub, "deep.ts"));
  });

  it("calls onSkip callback when statSync fails", () => {
    const dir = tmp();
    // Create a dangling symlink
    symlinkSync(join(dir, "nonexistent-target"), join(dir, "broken-link.ts"));
    const onSkip = vi.fn();
    // statSync on a dangling symlink throws ENOENT
    walkFiles(dir, new Set([".ts"]), new Set(), onSkip);
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onSkip.mock.calls[0][0]).toBe(join(dir, "broken-link.ts"));
    expect(typeof onSkip.mock.calls[0][1]).toBe("string");
  });

  it("onSkip is not called when no errors occur", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ok.ts"), "");
    const onSkip = vi.fn();
    walkFiles(dir, new Set([".ts"]), new Set(), onSkip);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("ignores common Windows hidden entries", () => {
    const dir = tmp();
    mkdirSync(join(dir, "$RECYCLE.BIN"));
    writeFileSync(join(dir, "$RECYCLE.BIN", "file.ts"), "");
    writeFileSync(join(dir, "Thumbs.db"), "");
    writeFileSync(join(dir, "desktop.ini"), "");
    writeFileSync(join(dir, "real.ts"), "");
    const result = walkFiles(dir, new Set([".ts", ".db", ".ini"]), new Set());
    expect(result).toEqual([join(dir, "real.ts")]);
  });

  it("uses isIgnored callback to skip files", () => {
    const dir = tmp();
    writeFileSync(join(dir, "app.ts"), "");
    writeFileSync(join(dir, "app.test.ts"), "");
    const isIgnored = (rel: string) => rel.includes(".test.");
    const result = walkFiles(dir, new Set([".ts"]), new Set(), undefined, isIgnored);
    expect(result).toEqual([join(dir, "app.ts")]);
  });

  it("uses isIgnored callback to skip directories", () => {
    const dir = tmp();
    const sub = join(dir, "generated");
    mkdirSync(sub);
    writeFileSync(join(sub, "code.ts"), "");
    writeFileSync(join(dir, "app.ts"), "");
    const isIgnored = (rel: string, isDir: boolean) => isDir && rel === "generated";
    const result = walkFiles(dir, new Set([".ts"]), new Set(), undefined, isIgnored);
    expect(result).toEqual([join(dir, "app.ts")]);
  });

  it("isIgnored receives paths relative to root dir", () => {
    const dir = tmp();
    const sub = join(dir, "lib");
    mkdirSync(sub);
    writeFileSync(join(sub, "deep.ts"), "");
    const paths: string[] = [];
    const isIgnored = (rel: string) => {
      paths.push(rel);
      return false;
    };
    walkFiles(dir, new Set([".ts"]), new Set(), undefined, isIgnored);
    expect(paths).toContain("lib");
    expect(paths).toContain(join("lib", "deep.ts"));
  });

  it("works without onSkip parameter (undefined)", () => {
    const dir = tmp();
    // Create a dangling symlink – should not throw even without onSkip
    symlinkSync(join(dir, "nonexistent-target"), join(dir, "broken.ts"));
    writeFileSync(join(dir, "ok.ts"), "");
    const result = walkFiles(dir, new Set([".ts"]), new Set());
    // The broken symlink is skipped silently, only ok.ts is found
    expect(result).toEqual([join(dir, "ok.ts")]);
  });
});
