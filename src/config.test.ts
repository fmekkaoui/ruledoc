import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, resolveConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./types.js";

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "config-test-"));
}

describe("ConfigError", () => {
  it("is an instance of Error with name 'ConfigError'", () => {
    const err = new ConfigError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConfigError");
    expect(err.message).toBe("test");
  });
});

describe("resolveConfig", () => {
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

  it("returns defaults when no file/CLI args", () => {
    const dir = tmp();
    const config = resolveConfig([], dir);
    expect(config.src).toBe(DEFAULT_CONFIG.src);
    expect(config.output).toBe(DEFAULT_CONFIG.output);
    expect(config.formats).toEqual(DEFAULT_CONFIG.formats);
    expect(config.extensions).toEqual(DEFAULT_CONFIG.extensions);
    expect(config.tag).toBe(DEFAULT_CONFIG.tag);
    expect(config.severities).toEqual(DEFAULT_CONFIG.severities);
    expect(config.pattern).toBeNull();
    expect(config.check).toBe(false);
    expect(config.quiet).toBe(false);
    expect(config.verbose).toBe(false);
  });

  it("loads from ruledoc.config.json", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.json"), JSON.stringify({ src: "./lib", output: "./RULES.md" }));
    const config = resolveConfig([], dir);
    expect(config.src).toBe("./lib");
    expect(config.output).toBe("./RULES.md");
  });

  it("loads from package.json 'ruledoc' field", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", ruledoc: { src: "./app", output: "./DOCS.md" } }),
    );
    const config = resolveConfig([], dir);
    expect(config.src).toBe("./app");
    expect(config.output).toBe("./DOCS.md");
  });

  it("prefers ruledoc.config.json over package.json", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.json"), JSON.stringify({ src: "./from-json" }));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", ruledoc: { src: "./from-pkg" } }));
    const config = resolveConfig([], dir);
    expect(config.src).toBe("./from-json");
  });

  it("CLI flags override file config", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.json"), JSON.stringify({ src: "./from-file" }));
    const config = resolveConfig(["--src", "./from-cli"], dir);
    expect(config.src).toBe("./from-cli");
  });

  it("throws ConfigError for invalid JSON in config file", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.json"), "{broken json");
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/Invalid JSON/);
  });

  it("warns on .ts config file", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.ts"), "export default {}");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveConfig([], dir);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("ruledoc.config.ts"));
  });

  it("warns on .js config file", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.js"), "module.exports = {}");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveConfig([], dir);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("ruledoc.config.js"));
  });

  it("warns on .mjs config file", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ruledoc.config.mjs"), "export default {}");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveConfig([], dir);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("ruledoc.config.mjs"));
  });

  it("package.json with broken JSON does not throw", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), "{not valid json!!");
    // Should not throw — broken package.json is silently ignored
    expect(() => resolveConfig([], dir)).not.toThrow();
  });

  it("package.json without 'ruledoc' field returns default config", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }));
    const config = resolveConfig([], dir);
    expect(config.src).toBe(DEFAULT_CONFIG.src);
  });
});

describe("parseCLI flags", () => {
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

  it("--src / -s", () => {
    const dir = tmp();
    expect(resolveConfig(["--src", "./a"], dir).src).toBe("./a");
    expect(resolveConfig(["-s", "./b"], dir).src).toBe("./b");
  });

  it("--output / -o", () => {
    const dir = tmp();
    expect(resolveConfig(["--output", "./OUT.md"], dir).output).toBe("./OUT.md");
    expect(resolveConfig(["-o", "./OUT2.md"], dir).output).toBe("./OUT2.md");
  });

  it("--format / -f", () => {
    const dir = tmp();
    expect(resolveConfig(["--format", "md,json"], dir).formats).toEqual(["md", "json"]);
    expect(resolveConfig(["-f", "html"], dir).formats).toEqual(["html"]);
  });

  it("--extensions / -e adds dot prefix if missing", () => {
    const dir = tmp();
    const config = resolveConfig(["--extensions", "ts,js"], dir);
    expect(config.extensions).toEqual([".ts", ".js"]);
  });

  it("--extensions / -e preserves existing dots", () => {
    const dir = tmp();
    const config = resolveConfig(["-e", ".ts,.js"], dir);
    expect(config.extensions).toEqual([".ts", ".js"]);
  });

  it("--ignore", () => {
    const dir = tmp();
    const config = resolveConfig(["--ignore", "dist,build"], dir);
    expect(config.ignore).toEqual(["dist", "build"]);
  });

  it("--tag / -t", () => {
    const dir = tmp();
    expect(resolveConfig(["--tag", "brule"], dir).tag).toBe("brule");
    expect(resolveConfig(["-t", "myrule"], dir).tag).toBe("myrule");
  });

  it("--severities", () => {
    const dir = tmp();
    const config = resolveConfig(["--severities", "low,medium,high"], dir);
    expect(config.severities).toEqual(["low", "medium", "high"]);
  });

  it("--pattern / -p", () => {
    const dir = tmp();
    const config = resolveConfig(["--pattern", "(@rule)\\s+(.+)"], dir);
    expect(config.pattern).toBe("(@rule)\\s+(.+)");
  });

  it("--check / -c", () => {
    const dir = tmp();
    expect(resolveConfig(["--check"], dir).check).toBe(true);
    expect(resolveConfig(["-c"], dir).check).toBe(true);
  });

  it("--quiet / -q", () => {
    const dir = tmp();
    expect(resolveConfig(["--quiet"], dir).quiet).toBe(true);
    expect(resolveConfig(["-q"], dir).quiet).toBe(true);
  });

  it("--verbose", () => {
    const dir = tmp();
    expect(resolveConfig(["--verbose"], dir).verbose).toBe(true);
  });

  it("--no-history", () => {
    const dir = tmp();
    expect(resolveConfig(["--no-history"], dir).history).toBe(false);
  });

  it("history defaults to true", () => {
    const dir = tmp();
    expect(resolveConfig([], dir).history).toBe(true);
  });

  it("--format with no value does not set formats", () => {
    const dir = tmp();
    // --format at end of args with no following value
    const config = resolveConfig(["--format"], dir);
    expect(config.formats).toEqual(DEFAULT_CONFIG.formats);
  });

  it("--extensions with no value does not set extensions", () => {
    const dir = tmp();
    const config = resolveConfig(["--extensions"], dir);
    expect(config.extensions).toEqual(DEFAULT_CONFIG.extensions);
  });

  it("--ignore with no value does not set ignore", () => {
    const dir = tmp();
    const config = resolveConfig(["--ignore"], dir);
    expect(config.ignore).toEqual(DEFAULT_CONFIG.ignore);
  });

  it("--severities with no value does not set severities", () => {
    const dir = tmp();
    const config = resolveConfig(["--severities"], dir);
    expect(config.severities).toEqual(DEFAULT_CONFIG.severities);
  });

  it("positional args: first is src, second is output", () => {
    const dir = tmp();
    const config = resolveConfig(["./mysrc", "./OUT.md"], dir);
    expect(config.src).toBe("./mysrc");
    expect(config.output).toBe("./OUT.md");
  });
});

describe("validation", () => {
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

  function configFile(dir: string, overrides: Record<string, unknown>) {
    writeFileSync(join(dir, "ruledoc.config.json"), JSON.stringify(overrides));
  }

  it("empty src throws", () => {
    const dir = tmp();
    configFile(dir, { src: "" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/src must be a non-empty/);
  });

  it("empty output throws", () => {
    const dir = tmp();
    configFile(dir, { output: "" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/output must be a non-empty/);
  });

  it("output not ending in .md throws", () => {
    const dir = tmp();
    configFile(dir, { output: "./rules.txt" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/output must end with .md/);
  });

  it("empty formats array throws", () => {
    const dir = tmp();
    configFile(dir, { formats: [] });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/formats must be a non-empty/);
  });

  it("unknown format throws", () => {
    const dir = tmp();
    configFile(dir, { formats: ["xml"] });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/unknown format "xml"/);
  });

  it("empty extensions throws", () => {
    const dir = tmp();
    configFile(dir, { extensions: [] });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/extensions must be a non-empty/);
  });

  it("extension without dot throws", () => {
    const dir = tmp();
    configFile(dir, { extensions: ["ts"] });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/must start with a dot/);
  });

  it("ignore not array throws", () => {
    const dir = tmp();
    configFile(dir, { ignore: "node_modules" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/ignore must be an array/);
  });

  it("empty tag throws", () => {
    const dir = tmp();
    configFile(dir, { tag: "" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/tag must be a non-empty/);
  });

  it("tag with whitespace throws", () => {
    const dir = tmp();
    configFile(dir, { tag: "my rule" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/tag must not contain whitespace/);
  });

  it("empty severities throws", () => {
    const dir = tmp();
    configFile(dir, { severities: [] });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/severities must be a non-empty/);
  });

  it("severity that is empty string throws", () => {
    const dir = tmp();
    configFile(dir, { severities: ["info", ""] });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/each severity must be a non-empty/);
  });

  it("pattern that is empty string throws", () => {
    const dir = tmp();
    configFile(dir, { pattern: "" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/pattern must be a non-empty string or null/);
  });

  it("pattern that is invalid regex throws", () => {
    const dir = tmp();
    configFile(dir, { pattern: "[invalid(" });
    expect(() => resolveConfig([], dir)).toThrow(ConfigError);
    expect(() => resolveConfig([], dir)).toThrow(/pattern is not a valid regex/);
  });

  it("quiet + verbose together throws", () => {
    const dir = tmp();
    expect(() => resolveConfig(["--quiet", "--verbose"], dir)).toThrow(ConfigError);
    expect(() => resolveConfig(["--quiet", "--verbose"], dir)).toThrow(/--quiet and --verbose cannot be used together/);
  });

  it("unknown CLI flags starting with - are ignored", () => {
    const dir = tmp();
    const config = resolveConfig(["--unknown-flag"], dir);
    // Should not crash, defaults applied
    expect(config.src).toBe(DEFAULT_CONFIG.src);
  });

  it("positional arg with src already set from flag is used as output", () => {
    const dir = tmp();
    const config = resolveConfig(["--src", "./mysrc", "./OUT.md"], dir);
    expect(config.src).toBe("./mysrc");
    expect(config.output).toBe("./OUT.md");
  });

  it("third positional arg is ignored", () => {
    const dir = tmp();
    const config = resolveConfig(["./mysrc", "./OUT.md", "extra"], dir);
    expect(config.src).toBe("./mysrc");
    expect(config.output).toBe("./OUT.md");
  });

  it("valid pattern string passes validation", () => {
    const dir = tmp();
    configFile(dir, { pattern: "(@\\w+)\\s+(.+)" });
    const config = resolveConfig([], dir);
    expect(config.pattern).toBe("(@\\w+)\\s+(.+)");
  });
});
