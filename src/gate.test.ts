import { afterEach, describe, expect, it, vi } from "vitest";
import { printProGate, requirePro } from "./gate.js";
import type { RuledocConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

function makeConfig(overrides: Partial<RuledocConfig> = {}): RuledocConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("printProGate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints warning and returns false", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = printProGate("tombstones", 75, false);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('"tombstones"');
    expect(warnSpy.mock.calls[0][0]).toContain("75 rules detected");
    expect(warnSpy.mock.calls[0][0]).toContain("buy.polar.sh/");
  });

  it("suppresses warning in quiet mode", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = printProGate("context", 50, true);

    expect(result).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("prints feature-specific name", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    printProGate("protect", 100, false);

    expect(warnSpy.mock.calls[0][0]).toContain('"protect"');
    expect(warnSpy.mock.calls[0][0]).toContain("100 rules detected");
  });
});

describe("requirePro", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true silently for free tier", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await requirePro("tombstones", 10, makeConfig());
    expect(result).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns true silently for valid license", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "granted" }), { status: 200 }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await requirePro("tombstones", 50, makeConfig({ license: "valid-key" }));

    expect(result).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns false and prints upgrade message when blocked", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await requirePro("tombstones", 50, makeConfig());

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("tombstones");
  });

  it("never throws even when console.warn throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("warn failed");
    });

    const result = await requirePro("tombstones", 50, makeConfig());

    expect(result).toBe(false);
  });
});
