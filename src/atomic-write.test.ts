import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteFileSync } from "./atomic-write.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ruledoc-atomic-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("atomicWriteFileSync", () => {
  it("writes file contents correctly", () => {
    const target = join(tmpDir, "out.txt");
    atomicWriteFileSync(target, "hello world");
    expect(readFileSync(target, "utf-8")).toBe("hello world");
  });

  it("overwrites existing file", () => {
    const target = join(tmpDir, "out.txt");
    atomicWriteFileSync(target, "first");
    atomicWriteFileSync(target, "second");
    expect(readFileSync(target, "utf-8")).toBe("second");
  });

  it("writes into nested directories", () => {
    const nested = join(tmpDir, "sub");
    mkdirSync(nested);
    const target = join(nested, "out.txt");
    atomicWriteFileSync(target, "nested");
    expect(readFileSync(target, "utf-8")).toBe("nested");
  });
});
