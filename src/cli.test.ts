import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;
let logs: string[];
let errors: string[];
let warns: string[];
let exitCode: number | undefined;
let originalCwd: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ruledoc-cli-"));
  logs = [];
  errors = [];
  warns = [];
  exitCode = undefined;
  originalCwd = process.cwd();
  process.env.NO_COLOR = "1";
  delete process.env.FORCE_COLOR;

  vi.spyOn(process, "exit").mockImplementation((code?: number | string | null | undefined) => {
    exitCode = (code ?? 0) as number;
    throw new Error("process.exit");
  });
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warns.push(args.join(" "));
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.NO_COLOR;
  vi.restoreAllMocks();
});

async function runCLI(args: string[]) {
  process.argv = ["node", "cli.js", ...args];
  vi.resetModules();
  try {
    await import("./cli.js");
  } catch (e) {
    if (e instanceof Error && e.message !== "process.exit") throw e;
  }
}

describe("cli", () => {
  describe("--help", () => {
    it("prints help text and exits 0", async () => {
      await runCLI(["--help"]);
      expect(exitCode).toBe(0);
      const output = logs.join("\n");
      expect(output).toContain("ruledoc");
      expect(output).toContain("Usage:");
      expect(output).toContain("Options:");
    });

    it("prints help with -h flag", async () => {
      await runCLI(["-h"]);
      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toContain("Usage:");
    });
  });

  describe("--version", () => {
    it("prints version and exits 0", async () => {
      await runCLI(["--version"]);
      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toMatch(/\d+\.\d+\.\d+/);
    });

    it("prints version with -v flag", async () => {
      await runCLI(["-v"]);
      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("--init", () => {
    it("creates ruledoc.config.json and exits 0", async () => {
      process.chdir(tmpDir);
      await runCLI(["--init"]);
      expect(exitCode).toBe(0);
      expect(existsSync(join(tmpDir, "ruledoc.config.json"))).toBe(true);
      const config = JSON.parse(readFileSync(join(tmpDir, "ruledoc.config.json"), "utf-8"));
      expect(config.src).toBe("./src");
      const output = logs.join("\n");
      expect(output).toContain("Created ruledoc.config.json");
    });

    it("does not overwrite existing config", async () => {
      process.chdir(tmpDir);
      writeFileSync(join(tmpDir, "ruledoc.config.json"), '{"src":"./custom"}');
      await runCLI(["--init"]);
      expect(exitCode).toBe(0);
      const config = JSON.parse(readFileSync(join(tmpDir, "ruledoc.config.json"), "utf-8"));
      expect(config.src).toBe("./custom");
      expect(logs.join("\n")).not.toContain("Created ruledoc.config.json");
    });

    it("shows example annotations", async () => {
      process.chdir(tmpDir);
      await runCLI(["--init"]);
      const output = logs.join("\n");
      expect(output).toContain("@rule(");
      expect(output).toContain("ruledoc init");
    });
  });

  describe("source directory", () => {
    it("exits 1 with error for non-existent src dir", async () => {
      process.chdir(tmpDir);
      await runCLI(["--src", join(tmpDir, "nonexistent")]);
      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("not found");
    });

    it("outputs 0 rules for valid src dir with no rule annotations", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "empty.ts"), "// no rules here\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md")]);
      const output = logs.join("\n");
      expect(output).toContain("0 rules");
    });
  });

  describe("rule extraction and output generation", () => {
    it("generates output files for src with rules", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "billing.ts"),
        "// @rule(billing.plans, critical, FLEW-1): Free plan limited to 50 items\nconst LIMIT = 50;\n",
      );
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      expect(existsSync(outMd)).toBe(true);
      expect(existsSync(join(tmpDir, "BUSINESS_RULES.json"))).toBe(true);

      const md = readFileSync(outMd, "utf-8");
      expect(md).toContain("Free plan limited to 50 items");
      expect(md).toContain("FLEW-1");

      const json = JSON.parse(readFileSync(join(tmpDir, "BUSINESS_RULES.json"), "utf-8"));
      expect(json.total).toBe(1);
      expect(json.rules[0].severity).toBe("critical");
    });

    it("generates HTML file with --format html", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "auth.ts"), "// @rule(auth): Session rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "html"]);
      expect(existsSync(join(tmpDir, "BUSINESS_RULES.html"))).toBe(true);
      const html = readFileSync(join(tmpDir, "BUSINESS_RULES.html"), "utf-8");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Session rule");
    });
  });

  describe("--check mode", () => {
    it("exits 0 when docs are up to date", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): My rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");

      // First, generate
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md"]);
      exitCode = undefined;
      logs = [];

      // Then check
      await runCLI(["--src", srcDir, "--output", outMd, "--check"]);
      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toContain("up to date");
    });

    it("exits 1 when docs are stale", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): My rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");

      // Write stale content
      writeFileSync(outMd, "stale content");

      await runCLI(["--src", srcDir, "--output", outMd, "--check"]);
      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("stale");
    });

    it("exits 0 when output file does not exist yet (nothing to compare)", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): My rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");

      // Don't generate first — just check
      await runCLI(["--src", srcDir, "--output", outMd, "--check"]);
      expect(exitCode).toBe(0);
    });
  });

  describe("--quiet mode", () => {
    it("suppresses non-error output", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): My rule\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--quiet"]);
      // With quiet, console.log is replaced with noop in the CLI, so no log output
      // Note: our mock still captures calls, but the CLI's own logger won't call console.log
      // The only logs would be from the top-level main() exit, not from the logger
      expect(logs.join("\n")).not.toContain("ruledoc");
    });
  });

  describe("--verbose mode", () => {
    it("lists all rules found", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "billing.ts"),
        "// @rule(billing.plans, critical): Plan limit\n// @rule(auth, warning): Auth check\n",
      );
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--verbose"]);
      const output = logs.join("\n");
      expect(output).toContain("Plan limit");
      expect(output).toContain("Auth check");
      expect(output).toContain("Billing");
    });
  });

  describe("invalid config", () => {
    it("exits 1 with error for invalid config", async () => {
      process.chdir(tmpDir);
      writeFileSync(join(tmpDir, "ruledoc.config.json"), '{"formats":[]}');
      await runCLI([]);
      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Invalid config");
    });

    it("exits 1 for malformed JSON config", async () => {
      process.chdir(tmpDir);
      writeFileSync(join(tmpDir, "ruledoc.config.json"), "{invalid json}");
      await runCLI([]);
      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Invalid JSON");
    });
  });

  describe("diff output", () => {
    it("shows added/removed rules when previous JSON exists", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // Write initial rule and generate
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing): Old rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];

      // Change the rules
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing): New rule\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      const output = logs.join("\n");
      // Should show diff markers
      expect(output).toContain("+");
      expect(output).toContain("-");
    });
  });

  describe("warnings", () => {
    it("prints warnings for bad annotations", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      // Use a typo in severity to trigger a warning
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing, crtical): Some rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md")]);
      const output = logs.join("\n");
      expect(output).toContain("⚠");
    });
  });

  describe("NO_COLOR env handling", () => {
    it("respects NO_COLOR environment variable", async () => {
      process.env.NO_COLOR = "1";
      await runCLI(["--help"]);
      const output = logs.join("\n");
      // With NO_COLOR, ANSI escape codes should not be present
      expect(output).not.toContain("\x1b[");
      delete process.env.NO_COLOR;
    });

    it("detects non-TTY and strips colors", async () => {
      // process.stdout.isTTY is already falsy in test environment
      // so colors should be stripped by default (without NO_COLOR)
      delete process.env.NO_COLOR;
      await runCLI(["--help"]);
      const output = logs.join("\n");
      // In non-TTY, colors should be stripped
      expect(output).not.toContain("\x1b[31m");
    });

    it("includes color codes when TTY and no NO_COLOR", async () => {
      delete process.env.NO_COLOR;
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, "isTTY", { value: true, writable: true, configurable: true });
      await runCLI(["--help"]);
      const output = logs.join("\n");
      // With TTY and no NO_COLOR, there should be color codes
      expect(output).toContain("\x1b[");
      Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, writable: true, configurable: true });
    });
  });

  describe("positional arguments", () => {
    it("accepts src and output as positional args", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): Positional test\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "out.md");
      await runCLI([srcDir, outMd]);
      expect(existsSync(outMd)).toBe(true);
    });
  });

  describe("output path listing", () => {
    it("lists generated output paths", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): A rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json,html"]);
      const output = logs.join("\n");
      expect(output).toContain("RULES.md");
      expect(output).toContain("RULES.json");
      expect(output).toContain("RULES.html");
    });
  });

  describe("critical and warning counts in summary", () => {
    it("shows critical and warning counts in summary line", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "test.ts"),
        "// @rule(billing, critical): Crit rule\n// @rule(billing, warning): Warn rule\n// @rule(billing): Info rule\n",
      );
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md")]);
      const output = logs.join("\n");
      expect(output).toContain("3 rules");
      expect(output).toContain("1 critical");
      expect(output).toContain("1 warning");
    });
  });

  describe("verbose with tickets", () => {
    it("shows ticket info in verbose output", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing, FLEW-99): Ticket rule\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--verbose"]);
      const output = logs.join("\n");
      expect(output).toContain("FLEW-99");
    });
  });

  describe("verbose with ignore source details", () => {
    it("shows gitignore disabled and extra patterns in verbose", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): A rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      await runCLI([
        "--src",
        srcDir,
        "--output",
        join(tmpDir, "out.md"),
        "--verbose",
        "--no-gitignore",
        "--no-ignore-tests",
        "--extra-ignore",
        "**/gen/**,**/vendor/**",
      ]);
      const output = logs.join("\n");
      expect(output).toContain("2 extra pattern");
    });

    it("shows singular extra pattern count", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): A rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--verbose", "--extra-ignore", "**/gen/**"]);
      const output = logs.join("\n");
      expect(output).toContain("1 extra pattern");
      expect(output).not.toContain("patterns");
    });
  });

  describe("verbose with non-info severity", () => {
    it("shows severity tag in verbose for non-info rules", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing, warning): Warn rule\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--verbose"]);
      const output = logs.join("\n");
      expect(output).toContain("[warning]");
    });
  });

  describe("no changes from previous", () => {
    it("does not print diff when there are no changes", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): Same rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");

      // Generate twice with same content
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      const output = logs.join("\n");
      // Should not have diff markers (+ or - followed by rule description)
      const diffLines = output.split("\n").filter((l) => /^\s+[+-]\s+Same rule/.test(l));
      expect(diffLines).toHaveLength(0);
    });
  });

  describe("empty warnings", () => {
    it("does not print warning section when no warnings", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): Good rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--no-require-ids"]);
      const output = logs.join("\n");
      // printWarnings returns early for empty, so no warning symbol should appear
      // (the only ⚠ in output should come from warnings)
      const warningLines = output.split("\n").filter((l) => l.includes("⚠") && l.includes("—"));
      expect(warningLines).toHaveLength(0);
    });
  });

  describe("verbose with empty rules", () => {
    it("does not print verbose section when no rules", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "empty.ts"), "// nothing\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--verbose"]);
      const output = logs.join("\n");
      expect(output).toContain("0 rules");
    });
  });

  describe("non-ConfigError thrown during resolveConfig", () => {
    it("handles ConfigError from malformed JSON config", async () => {
      process.chdir(tmpDir);
      writeFileSync(join(tmpDir, "ruledoc.config.json"), "not json at all{{{");
      await runCLI([]);
      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Invalid JSON");
    });

    it("re-throws non-ConfigError errors", async () => {
      // Mock resolveConfig to throw a generic Error
      vi.resetModules();
      vi.doMock("./config.js", () => ({
        resolveConfig: () => {
          throw new TypeError("unexpected error");
        },
        ConfigError: class ConfigError extends Error {
          constructor(msg: string) {
            super(msg);
            this.name = "ConfigError";
          }
        },
      }));

      process.argv = ["node", "cli.js", "--src", "./src"];
      let thrownError: unknown;
      try {
        await import("./cli.js");
      } catch (e) {
        thrownError = e;
      }

      // Should re-throw wrapped error with cause
      expect(thrownError).toBeInstanceOf(Error);
      expect((thrownError as Error).message).toContain("unexpected error");
      expect((thrownError as Error).cause).toBeInstanceOf(TypeError);

      // Clean up mock so it doesn't leak to subsequent tests
      vi.doUnmock("./config.js");
    });
  });

  describe("history", () => {
    it("creates history file when rules are removed", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // First run with a rule
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing): Old rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];

      // Remove the rule
      writeFileSync(join(srcDir, "billing.ts"), "const x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      const historyPath = join(tmpDir, "BUSINESS_RULES_HISTORY.json");
      expect(existsSync(historyPath)).toBe(true);
      const history = JSON.parse(readFileSync(historyPath, "utf-8"));
      expect(history).toHaveLength(1);
      expect(history[0].rule.description).toBe("Old rule");

      // Markdown should have Removed Rules section
      const md = readFileSync(outMd, "utf-8");
      expect(md).toContain("Removed Rules");
      expect(md).toContain("Old rule");
    });

    it("does not create history file with --no-history", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // First run with a rule
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing): Old rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];

      // Remove the rule with --no-history
      writeFileSync(join(srcDir, "billing.ts"), "const x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json", "--no-history"]);

      const historyPath = join(tmpDir, "BUSINESS_RULES_HISTORY.json");
      expect(existsSync(historyPath)).toBe(false);

      // Markdown should NOT have Removed Rules section
      const md = readFileSync(outMd, "utf-8");
      expect(md).not.toContain("Removed Rules");
    });

    it("does not create history file when no rules are removed", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): My rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      const historyPath = join(tmpDir, "BUSINESS_RULES_HISTORY.json");
      expect(existsSync(historyPath)).toBe(false);
    });
  });

  describe("tombstone ID reuse", () => {
    it("warns when a tombstoned rule ID is reused", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // Run 1: create rule with ID
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing, RUL-001): Original rule\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      errors = [];

      // Run 2: remove the rule
      writeFileSync(join(srcDir, "billing.ts"), "const x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      errors = [];

      // Run 3: recreate a rule with the same ID
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing, RUL-001): Reused ID rule\nconst x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      const output = logs.join("\n");
      expect(output).toContain("was previously removed and should not be reused");
    });
  });

  describe("context format", () => {
    it("generates context file with --format context", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): Context rule\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "context"]);
      expect(existsSync(join(tmpDir, "BUSINESS_RULES.context"))).toBe(true);
      const ctx = readFileSync(join(tmpDir, "BUSINESS_RULES.context"), "utf-8");
      expect(ctx).toContain("Business Rules");
      expect(ctx).toContain("Context rule");
    });
  });

  describe("--protect", () => {
    it("exits 2 with --check --protect critical when critical rule removed", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // First run with critical rule
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing.plans, critical): Plan limit\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      errors = [];

      // Remove the critical rule
      writeFileSync(join(srcDir, "billing.ts"), "const x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json", "--check", "--protect", "critical"]);
      expect(exitCode).toBe(2);
      expect(errors.join("\n")).toContain("build blocked");
    });

    it("warns without --check when protected rule removed", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing.plans, critical): Plan limit\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      errors = [];

      writeFileSync(join(srcDir, "billing.ts"), "const x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json", "--protect", "critical"]);
      // Should not exit 2 without --check
      expect(exitCode).toBeUndefined();
      expect(logs.join("\n")).toContain("protected rule(s) removed");
    });

    it("--allow-removal bypasses protection", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing.plans, critical): Plan limit\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      errors = [];

      writeFileSync(join(srcDir, "billing.ts"), "const x = 1;\n");
      await runCLI([
        "--src",
        srcDir,
        "--output",
        outMd,
        "--format",
        "md,json",
        "--check",
        "--protect",
        "critical",
        "--allow-removal",
      ]);
      // Should not exit 2
      expect(exitCode).not.toBe(2);
    });

    it("@rule-removed acknowledgment unblocks protected removal", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing.plans, critical): Plan limit\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];
      errors = [];

      // Remove rule but add @rule-removed acknowledgment
      writeFileSync(
        join(srcDir, "billing.ts"),
        "// @rule-removed(billing.plans, JIRA-456): Migrated to config service\nconst x = 1;\n",
      );
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json", "--check", "--protect", "critical"]);
      // Should not exit 2 — acknowledged
      expect(exitCode).not.toBe(2);
      expect(logs.join("\n")).toContain("acknowledged");
    });
  });

  describe("modified rules", () => {
    it("shows modified rules when rule with same ID changes", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // First run with a rule that has an ID
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing, RUL-001): Old description\nconst x = 1;\n");
      process.chdir(tmpDir);
      const outMd = join(tmpDir, "BUSINESS_RULES.md");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);
      exitCode = undefined;
      logs = [];

      // Change the description but keep the same ID
      writeFileSync(join(srcDir, "billing.ts"), "// @rule(billing, RUL-001, warning): New description\nconst x = 1;\n");
      await runCLI(["--src", srcDir, "--output", outMd, "--format", "md,json"]);

      const output = logs.join("\n");
      expect(output).toContain("~");
      expect(output).toContain("New description");
    });
  });

  describe("no diff printed when no previous rules exist", () => {
    it("does not print diff on first run", async () => {
      const srcDir = join(tmpDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// @rule(billing): First rule\n");
      process.chdir(tmpDir);
      await runCLI(["--src", srcDir, "--output", join(tmpDir, "out.md"), "--format", "md,json"]);
      const output = logs.join("\n");
      // No diff markers on first run (prev.length === 0)
      const diffLines = output.split("\n").filter((l) => /^\s+[+-]\s+First rule/.test(l));
      expect(diffLines).toHaveLength(0);
    });
  });
});
