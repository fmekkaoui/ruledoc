import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CLI_PATH = resolve(__dirname, "../../dist/cli.js");
export const FIXTURES_DIR = resolve(__dirname, "fixtures");

const CLI_ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

let tmpCounter = 0;

export function copyFixture(name: string): string {
	const src = join(FIXTURES_DIR, name);
	const tmp = join(tmpdir(), `ruledoc-e2e-${name}-${Date.now()}-${tmpCounter++}`);
	mkdirSync(tmp, { recursive: true });
	cpSync(src, tmp, { recursive: true });
	return tmp;
}

export interface CLIResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export function runCLI(args: string[], cwd: string): CLIResult {
	try {
		const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
			cwd,
			encoding: "utf-8",
			env: CLI_ENV,
			timeout: 30_000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (err: any) {
		if (err.signal) {
			throw new Error(`CLI process killed by ${err.signal} (timeout?)`);
		}
		return {
			stdout: err.stdout ?? "",
			stderr: err.stderr ?? "",
			exitCode: err.status ?? 1,
		};
	}
}

export function readJSON(filePath: string): any {
	return JSON.parse(readFile(filePath));
}

export function readFile(filePath: string): string {
	return readFileSync(filePath, "utf-8");
}

export function fileExists(filePath: string): boolean {
	return existsSync(filePath);
}

export function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}
