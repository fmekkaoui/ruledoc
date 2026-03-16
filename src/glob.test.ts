import { describe, expect, it } from "vitest";
import { globToRegex, matchesAnyGlob } from "./glob.js";

describe("globToRegex", () => {
  it("matches * as any non-slash characters", () => {
    const re = globToRegex("*.ts");
    expect(re.test("foo.ts")).toBe(true);
    expect(re.test("bar.ts")).toBe(true);
    expect(re.test("foo.js")).toBe(false);
    // * should not match paths with /
    expect(re.test("dir/foo.ts")).toBe(true); // unanchored — matches at any depth
  });

  it("matches ** as anything including slashes", () => {
    const re = globToRegex("**/*.ts");
    expect(re.test("foo.ts")).toBe(true);
    expect(re.test("src/foo.ts")).toBe(true);
    expect(re.test("a/b/c/foo.ts")).toBe(true);
    expect(re.test("foo.js")).toBe(false);
  });

  it("matches ? as single non-slash character", () => {
    const re = globToRegex("?.ts");
    expect(re.test("a.ts")).toBe(true);
    expect(re.test("ab.ts")).toBe(false);
    expect(re.test("/.ts")).toBe(false);
  });

  it("anchors pattern to root when leading /", () => {
    const re = globToRegex("/dist");
    expect(re.test("dist")).toBe(true);
    expect(re.test("src/dist")).toBe(false);
  });

  it("unanchored patterns match at any depth", () => {
    const re = globToRegex("dist");
    expect(re.test("dist")).toBe(true);
    expect(re.test("src/dist")).toBe(true);
    expect(re.test("a/b/dist")).toBe(true);
  });

  it("trailing / matches directory (anything inside)", () => {
    const re = globToRegex("build/");
    expect(re.test("build")).toBe(true);
    expect(re.test("build/output.js")).toBe(true);
    expect(re.test("src/build")).toBe(true);
    expect(re.test("src/build/output.js")).toBe(true);
  });

  it("escapes regex special chars in pattern", () => {
    const re = globToRegex("file.min.js");
    expect(re.test("file.min.js")).toBe(true);
    expect(re.test("filexminxjs")).toBe(false);
  });

  it("handles complex glob: **/__tests__/**", () => {
    const re = globToRegex("**/__tests__/**");
    expect(re.test("__tests__/foo.ts")).toBe(true);
    expect(re.test("src/__tests__/bar.ts")).toBe(true);
    expect(re.test("src/__tests__/nested/baz.ts")).toBe(true);
    expect(re.test("src/regular/foo.ts")).toBe(false);
  });

  it("handles **/*.test.ts pattern", () => {
    const re = globToRegex("**/*.test.ts");
    expect(re.test("foo.test.ts")).toBe(true);
    expect(re.test("src/foo.test.ts")).toBe(true);
    expect(re.test("foo.ts")).toBe(false);
    expect(re.test("foo.test.js")).toBe(false);
  });

  it("handles pattern with only **", () => {
    const re = globToRegex("**/node_modules");
    expect(re.test("node_modules")).toBe(true);
    expect(re.test("packages/a/node_modules")).toBe(true);
  });
});

describe("matchesAnyGlob", () => {
  it("returns true if any regex matches", () => {
    const regexes = [globToRegex("*.ts"), globToRegex("*.js")];
    expect(matchesAnyGlob("foo.ts", regexes)).toBe(true);
    expect(matchesAnyGlob("foo.js", regexes)).toBe(true);
    expect(matchesAnyGlob("foo.py", regexes)).toBe(false);
  });

  it("returns false for empty regex list", () => {
    expect(matchesAnyGlob("foo.ts", [])).toBe(false);
  });
});
