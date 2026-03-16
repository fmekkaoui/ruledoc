import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isProEnabled } from "./license.js";
import type { RuledocConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

function makeConfig(overrides: Partial<RuledocConfig> = {}): RuledocConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

function writeCache(dir: string, data: { key: string; valid: boolean; checkedAt: string }) {
  writeFileSync(join(dir, ".ruledoc-license.json"), JSON.stringify(data));
}

describe("isProEnabled", () => {
  const dirs: string[] = [];
  let originalEnv: string | undefined;

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "license-test-"));
    dirs.push(d);
    return d;
  }

  beforeEach(() => {
    originalEnv = process.env.RULEDOC_LICENSE;
    delete process.env.RULEDOC_LICENSE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
    if (originalEnv !== undefined) process.env.RULEDOC_LICENSE = originalEnv;
    else delete process.env.RULEDOC_LICENSE;
  });

  it("returns true for free tier (< 50 rules) without any key", async () => {
    expect(await isProEnabled(49, makeConfig())).toBe(true);
    expect(await isProEnabled(0, makeConfig())).toBe(true);
    expect(await isProEnabled(1, makeConfig())).toBe(true);
  });

  it("returns false when >= 50 rules and no key", async () => {
    expect(await isProEnabled(50, makeConfig())).toBe(false);
    expect(await isProEnabled(100, makeConfig())).toBe(false);
  });

  it("env var takes precedence over config", async () => {
    const dir = tmp();
    process.env.RULEDOC_LICENSE = "env-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "granted" }), { status: 200 }));

    await isProEnabled(50, makeConfig({ license: "config-key" }), dir);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.key).toBe("env-key");
  });

  it("uses config license when no env var", async () => {
    const dir = tmp();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "granted" }), { status: 200 }));

    await isProEnabled(50, makeConfig({ license: "config-key" }), dir);

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.key).toBe("config-key");
  });

  it("valid cache within TTL skips API call", async () => {
    const dir = tmp();
    writeCache(dir, { key: "my-key", valid: true, checkedAt: new Date().toISOString() });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("expired cache triggers API call", async () => {
    const dir = tmp();
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    writeCache(dir, { key: "my-key", valid: true, checkedAt: oldDate });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "granted" }), { status: 200 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("API success writes cache", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "granted" }), { status: 200 }),
    );

    await isProEnabled(50, makeConfig({ license: "new-key" }), dir);

    const cache = JSON.parse(readFileSync(join(dir, ".ruledoc-license.json"), "utf-8"));
    expect(cache.key).toBe("new-key");
    expect(cache.valid).toBe(true);
    expect(cache.checkedAt).toBeDefined();
  });

  it("API failure uses grace period cache (< 30 days)", async () => {
    const dir = tmp();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    writeCache(dir, { key: "my-key", valid: true, checkedAt: tenDaysAgo });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
  });

  it("API failure + expired grace period returns false", async () => {
    const dir = tmp();
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    writeCache(dir, { key: "my-key", valid: true, checkedAt: oldDate });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(false);
  });

  it("corrupt cache is handled gracefully", async () => {
    const dir = tmp();
    writeFileSync(join(dir, ".ruledoc-license.json"), "not json!!!");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "granted" }), { status: 200 }),
    );

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
  });

  it("missing cache file is handled gracefully", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "granted" }), { status: 200 }),
    );

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
  });

  it("never throws on bad cacheDir", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    const result = await isProEnabled(50, makeConfig({ license: "key" }), "/nonexistent/path");

    expect(result).toBe(false);
  });

  it("defaults cacheDir to cwd when not provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "granted" }), { status: 200 }),
    );

    const result = await isProEnabled(50, makeConfig({ license: "key" }));

    expect(result).toBe(true);
  });

  it("never throws even with unexpected errors", async () => {
    // Force an error in the outer try block by making config.license throw
    const badConfig = makeConfig();
    Object.defineProperty(badConfig, "license", {
      get() {
        throw new Error("unexpected");
      },
    });

    const result = await isProEnabled(50, badConfig);

    expect(result).toBe(false);
  });

  it("API returning non-granted status returns false", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "revoked" }), { status: 200 }),
    );

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(false);
  });

  it("API returning non-200 status without cache returns false", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(false);
  });

  it("API returning non-200 status uses grace period", async () => {
    const dir = tmp();
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    writeCache(dir, { key: "my-key", valid: true, checkedAt: recentDate });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
  });

  it("cache with valid JSON but missing fields is ignored", async () => {
    const dir = tmp();
    writeFileSync(join(dir, ".ruledoc-license.json"), JSON.stringify({ key: "my-key" }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "granted" }), { status: 200 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("API returning non-object body returns false (type guard)", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify("just a string"), { status: 200 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(false);
  });

  it("API returning null body returns false (type guard)", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(null), { status: 200 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(false);
  });

  it("API returning body without status field returns false (type guard)", async () => {
    const dir = tmp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ foo: "bar" }), { status: 200 }));

    const result = await isProEnabled(50, makeConfig({ license: "my-key" }), dir);

    expect(result).toBe(false);
  });

  it("cache with different key is ignored", async () => {
    const dir = tmp();
    writeCache(dir, { key: "old-key", valid: true, checkedAt: new Date().toISOString() });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "granted" }), { status: 200 }));

    await isProEnabled(50, makeConfig({ license: "new-key" }), dir);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
