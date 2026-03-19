import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { cleanup, copyFixture, fileExists, readFile, readJSON, runCLI } from "./helpers.js";

let tmpDirs: string[] = [];

function useTmp(name: string): string {
	const dir = copyFixture(name);
	tmpDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tmpDirs) cleanup(dir);
	tmpDirs = [];
});

describe("ruledoc CLI e2e", () => {
	describe("basic project output", () => {
		let cwd: string;
		let json: any;

		beforeEach(() => {
			cwd = useTmp("basic-project");
			const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md"], cwd);
			expect(result.exitCode).toBe(0);
			json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		});

		it("generates MD and JSON with correct rule count", () => {
			expect(fileExists(join(cwd, "BUSINESS_RULES.md"))).toBe(true);
			expect(fileExists(join(cwd, "BUSINESS_RULES.json"))).toBe(true);
			expect(json.total).toBe(5);
			expect(json.rules).toHaveLength(5);
			expect(json.generated).toBeDefined();
			expect(json.tree).toBeDefined();
		});

		it("produces rules with correct fields", () => {
			const rule = json.rules.find((r: any) => r.fullScope === "billing.plans");
			expect(rule).toBeDefined();
			expect(rule.scope).toBe("billing");
			expect(rule.subscope).toBe("plans");
			expect(rule.severity).toBe("critical");
			expect(rule.description).toBe("Free plan limited to 50 items");
			expect(rule.file).toMatch(/billing\.ts$/);
			expect(rule.line).toBeGreaterThan(0);
			expect(rule.codeContext).toBeDefined();
		});

		it("parses ticket references", () => {
			const rule = json.rules.find((r: any) => r.fullScope === "billing.refunds");
			expect(rule).toBeDefined();
			expect(rule.ticket).toBe("BILL-42");
		});
	});

	it("handles projects with no rules", () => {
		const cwd = useTmp("no-rules-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(0);
		expect(json.rules).toHaveLength(0);
	});

	it("excludes test files by default", () => {
		const cwd = useTmp("test-files-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(1);
		expect(json.rules[0].fullScope).toBe("billing.plans");
	});

	it("includes test files with --no-ignore-tests", () => {
		const cwd = useTmp("test-files-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--no-ignore-tests"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(2);
	});

	it("suppresses output with --quiet", () => {
		const cwd = useTmp("basic-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--quiet"], cwd);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("");
	});

	it("outputs version with --version", () => {
		const result = runCLI(["--version"], tmpdir());

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("outputs help with --help", () => {
		const result = runCLI(["--help"], tmpdir());

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("ruledoc");
		expect(result.stdout).toContain("@rule");
	});

	it("exits 2 with --check --protect critical when critical rule removed", () => {
		const cwd = useTmp("critical-removal");
		const result = runCLI(
			["--src", "src", "--output", "BUSINESS_RULES.md", "--format", "md,json", "--check", "--protect", "critical"],
			cwd,
		);

		expect(result.exitCode).toBe(2);
	});

	it("exits 1 for non-existent source directory", () => {
		const cwd = useTmp("basic-project");
		const result = runCLI(["--src", "nonexistent"], cwd);

		expect(result.exitCode).toBe(1);
	});

	it("generates context format output", () => {
		const cwd = useTmp("basic-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--format", "context"], cwd);

		// Context format is a Pro feature; if gated, it won't generate the file
		// but should still exit 0
		expect(result.exitCode).toBe(0);

		if (fileExists(join(cwd, "BUSINESS_RULES.context"))) {
			const content = readFile(join(cwd, "BUSINESS_RULES.context"));
			expect(content).toMatch(/^# Business Rules/);
			expect(content).toContain("[critical]");
			expect(content).toContain("billing.plans");
		}
	});

	it("creates config with --init", () => {
		const cwd = useTmp("no-rules-project");
		const result = runCLI(["--init"], cwd);

		expect(result.exitCode).toBe(0);
		expect(fileExists(join(cwd, "ruledoc.config.json"))).toBe(true);

		const config = readJSON(join(cwd, "ruledoc.config.json"));
		expect(config.src).toBeDefined();
		expect(config.output).toBeDefined();
		expect(config.formats).toBeDefined();
	});

	it("handles large projects with 55+ rules", () => {
		const cwd = useTmp("large-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(55);
	});

	it("respects .gitignore patterns", () => {
		const cwd = useTmp("gitignore-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(1);
		expect(json.rules[0].fullScope).toBe("billing.plans");
	});

	it("generates HTML format output", () => {
		const cwd = useTmp("basic-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--format", "html"], cwd);

		expect(result.exitCode).toBe(0);
		expect(fileExists(join(cwd, "BUSINESS_RULES.html"))).toBe(true);

		const html = readFile(join(cwd, "BUSINESS_RULES.html"));
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("Business Rules");
		expect(html).toContain("billing.plans");
		expect(html).toContain("critical");
	});

	it("lists rules with --verbose", () => {
		const cwd = useTmp("basic-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--verbose"], cwd);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Billing");
		expect(result.stdout).toContain("Auth");
		expect(result.stdout).toContain("Free plan limited to 50 items");
	});

	describe("--check mode", () => {
		let cwd: string;

		beforeEach(() => {
			cwd = useTmp("basic-project");
			runCLI(["--src", "src", "--output", "BUSINESS_RULES.md"], cwd);
		});

		it("exits 1 when docs are stale", () => {
			writeFileSync(join(cwd, "BUSINESS_RULES.md"), "stale content");

			const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--check"], cwd);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("stale");
		});

		it("exits 0 when docs are up to date", () => {
			const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--check"], cwd);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("up to date");
		});
	});

	it("uses custom tag with --tag", () => {
		const cwd = useTmp("custom-tag-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--tag", "policy"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(2);

		const scopes = json.rules.map((r: any) => r.fullScope).sort();
		expect(scopes).toEqual(["access.admin", "access.viewer"]);
	});

	it("scans custom extensions with --extensions", () => {
		const cwd = useTmp("vue-project");
		const result = runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--extensions", ".vue"], cwd);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(1);
		expect(json.rules[0].fullScope).toBe("billing.plans");
	});

	it("skips history file with --no-history", () => {
		const cwd = useTmp("critical-removal");
		runCLI(["--src", "src", "--output", "BUSINESS_RULES.md", "--no-history"], cwd);

		expect(fileExists(join(cwd, "BUSINESS_RULES_HISTORY.json"))).toBe(false);
	});

	it("excludes patterns with --extra-ignore", () => {
		const cwd = useTmp("extra-ignore-project");
		const result = runCLI(
			["--src", "src", "--output", "BUSINESS_RULES.md", "--extra-ignore", "**/generated/**"],
			cwd,
		);

		expect(result.exitCode).toBe(0);
		const json = readJSON(join(cwd, "BUSINESS_RULES.json"));
		expect(json.total).toBe(2);

		const scopes = json.rules.map((r: any) => r.fullScope);
		expect(scopes).not.toContain("generated.auto");
	});

	it("accepts positional arguments for src and output", () => {
		const cwd = useTmp("positional-args-project");
		const result = runCLI(["src", "OUTPUT.md"], cwd);

		expect(result.exitCode).toBe(0);
		expect(fileExists(join(cwd, "OUTPUT.md"))).toBe(true);
		expect(fileExists(join(cwd, "OUTPUT.json"))).toBe(true);

		const json = readJSON(join(cwd, "OUTPUT.json"));
		expect(json.total).toBe(1);
	});

	it("reads ruledoc.config.json for configuration", () => {
		const cwd = useTmp("config-file-project");
		const result = runCLI([], cwd);

		expect(result.exitCode).toBe(0);
		expect(fileExists(join(cwd, "DOCS.md"))).toBe(true);
		expect(fileExists(join(cwd, "DOCS.json"))).toBe(true);

		const json = readJSON(join(cwd, "DOCS.json"));
		expect(json.total).toBe(2);
	});
});
