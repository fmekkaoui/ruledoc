import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuledocConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

// ---------------------------------------------------------------------------
// Config validation errors
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// ---------------------------------------------------------------------------
// Load config from ruledoc.config.json or package.json
// ---------------------------------------------------------------------------

function loadConfigFile(cwd: string, warnings?: string[]): Partial<RuledocConfig> | null {
  // Only JSON — no eval, no code execution
  const jsonPath = join(cwd, "ruledoc.config.json");
  if (existsSync(jsonPath)) {
    try {
      return JSON.parse(readFileSync(jsonPath, "utf-8"));
    } catch (err) {
      throw new ConfigError(`Invalid JSON in ruledoc.config.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Warn if user has a JS/TS config (unsupported)
  for (const name of ["ruledoc.config.ts", "ruledoc.config.js", "ruledoc.config.mjs"]) {
    if (existsSync(join(cwd, name))) {
      const msg = `⚠ Found ${name} — only ruledoc.config.json is supported. Rename to .json or use the "ruledoc" field in package.json.`;
      if (warnings) {
        warnings.push(msg);
      } else {
        console.warn(msg);
      }
      break;
    }
  }

  // package.json "ruledoc" field
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.ruledoc && typeof pkg.ruledoc === "object") {
        return pkg.ruledoc;
      }
    } catch {
      // Not our problem if package.json is broken
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------

function parseCLI(args: string[]): Partial<RuledocConfig> {
  const config: Partial<RuledocConfig> = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case "--src":
      case "-s":
        config.src = args[++i];
        break;

      case "--output":
      case "-o":
        config.output = args[++i];
        break;

      case "--format":
      case "-f": {
        const val = args[++i];
        if (val) config.formats = val.split(",").map((s) => s.trim()) as RuledocConfig["formats"];
        break;
      }

      case "--extensions":
      case "-e": {
        const val = args[++i];
        if (val) config.extensions = val.split(",").map((s) => (s.startsWith(".") ? s.trim() : `.${s.trim()}`));
        break;
      }

      case "--ignore": {
        const val = args[++i];
        if (val) config.ignore = val.split(",").map((s) => s.trim());
        break;
      }

      case "--tag":
      case "-t":
        config.tag = args[++i];
        break;

      case "--severities": {
        const val = args[++i];
        if (val) config.severities = val.split(",").map((s) => s.trim());
        break;
      }

      case "--pattern":
      case "-p":
        config.pattern = args[++i];
        break;

      case "--check":
      case "-c":
        config.check = true;
        break;

      case "--quiet":
      case "-q":
        config.quiet = true;
        break;

      case "--verbose":
        config.verbose = true;
        break;

      case "--no-history":
        config.history = false;
        break;

      case "--protect": {
        const val = args[++i];
        if (val) config.protect = val.split(",").map((s) => s.trim());
        break;
      }

      case "--allow-removal":
        config.allowRemoval = true;
        break;

      default:
        if (!arg.startsWith("-")) {
          if (!config.src) config.src = arg;
          else if (!config.output) config.output = arg;
        }
        break;
    }

    i++;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_FORMATS = new Set(["md", "json", "html", "context"]);

function validate(config: RuledocConfig): void {
  const errors: string[] = [];

  // src
  if (typeof config.src !== "string" || config.src.trim() === "") {
    errors.push('src must be a non-empty string (e.g. "./src")');
  }

  // output
  if (typeof config.output !== "string" || config.output.trim() === "") {
    errors.push('output must be a non-empty string (e.g. "./BUSINESS_RULES.md")');
  } else if (!config.output.endsWith(".md")) {
    errors.push("output must end with .md (JSON and HTML paths are derived from it)");
  }

  // formats
  if (!Array.isArray(config.formats) || config.formats.length === 0) {
    errors.push('formats must be a non-empty array (e.g. ["md", "json"])');
  } else {
    for (const f of config.formats) {
      if (!VALID_FORMATS.has(f)) {
        errors.push(`unknown format "${f}" — valid formats: ${[...VALID_FORMATS].join(", ")}`);
      }
    }
  }

  // extensions
  if (!Array.isArray(config.extensions) || config.extensions.length === 0) {
    errors.push('extensions must be a non-empty array (e.g. [".ts", ".tsx"])');
  } else {
    for (const ext of config.extensions) {
      if (!ext.startsWith(".")) {
        errors.push(`extension "${ext}" must start with a dot (e.g. ".${ext}")`);
      }
    }
  }

  // ignore
  if (!Array.isArray(config.ignore)) {
    errors.push("ignore must be an array of directory names");
  }

  // tag
  if (typeof config.tag !== "string" || config.tag.trim() === "") {
    errors.push('tag must be a non-empty string (e.g. "rule")');
  } else if (/\s/.test(config.tag)) {
    errors.push("tag must not contain whitespace");
  }

  // severities
  if (!Array.isArray(config.severities) || config.severities.length === 0) {
    errors.push('severities must be a non-empty array (e.g. ["info", "warning", "critical"])');
  } else {
    for (const s of config.severities) {
      if (typeof s !== "string" || s.trim() === "") {
        errors.push("each severity must be a non-empty string");
        break;
      }
    }
  }

  // pattern
  if (config.pattern !== null) {
    if (typeof config.pattern !== "string" || config.pattern.trim() === "") {
      errors.push("pattern must be a non-empty string or null");
    } else {
      try {
        new RegExp(config.pattern);
      } catch (err) {
        errors.push(`pattern is not a valid regex: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // protect + context severity checks share the same set
  const sevSet = new Set(config.severities);

  // protect
  if (config.protect.length > 0) {
    for (const p of config.protect) {
      if (!sevSet.has(p)) {
        errors.push(`unknown protected severity "${p}" — valid severities: ${config.severities.join(", ")}`);
      }
    }
  }

  // context options
  if (config.context) {
    if (config.context.maxRules !== undefined) {
      if (!Number.isInteger(config.context.maxRules) || config.context.maxRules <= 0) {
        errors.push("context.maxRules must be a positive integer");
      }
    }
    if (config.context.severities) {
      for (const s of config.context.severities) {
        if (!sevSet.has(s)) {
          errors.push(`unknown context severity "${s}" — valid severities: ${config.severities.join(", ")}`);
        }
      }
    }
  }

  // quiet + verbose conflict
  if (config.quiet && config.verbose) {
    errors.push("--quiet and --verbose cannot be used together");
  }

  if (errors.length > 0) {
    throw new ConfigError(`Invalid config:\n  • ${errors.join("\n  • ")}`);
  }
}

// ---------------------------------------------------------------------------
// Merge: defaults < config file < CLI flags → validate
// ---------------------------------------------------------------------------

export function resolveConfig(args: string[], cwd: string = process.cwd(), warnings?: string[]): RuledocConfig {
  const fileConfig = loadConfigFile(cwd, warnings) || {};
  const cliConfig = parseCLI(args);

  const config: RuledocConfig = {
    src: cliConfig.src ?? fileConfig.src ?? DEFAULT_CONFIG.src,
    output: cliConfig.output ?? fileConfig.output ?? DEFAULT_CONFIG.output,
    formats: cliConfig.formats ?? fileConfig.formats ?? DEFAULT_CONFIG.formats,
    extensions: cliConfig.extensions ?? fileConfig.extensions ?? DEFAULT_CONFIG.extensions,
    ignore: cliConfig.ignore ?? fileConfig.ignore ?? DEFAULT_CONFIG.ignore,
    tag: cliConfig.tag ?? fileConfig.tag ?? DEFAULT_CONFIG.tag,
    severities: cliConfig.severities ?? fileConfig.severities ?? DEFAULT_CONFIG.severities,
    pattern: cliConfig.pattern ?? fileConfig.pattern ?? DEFAULT_CONFIG.pattern,
    protect: cliConfig.protect ?? fileConfig.protect ?? DEFAULT_CONFIG.protect,
    allowRemoval: cliConfig.allowRemoval ?? fileConfig.allowRemoval ?? DEFAULT_CONFIG.allowRemoval,
    check: cliConfig.check ?? fileConfig.check ?? DEFAULT_CONFIG.check,
    quiet: cliConfig.quiet ?? fileConfig.quiet ?? DEFAULT_CONFIG.quiet,
    verbose: cliConfig.verbose ?? fileConfig.verbose ?? DEFAULT_CONFIG.verbose,
    history: cliConfig.history ?? fileConfig.history ?? DEFAULT_CONFIG.history,
    context: cliConfig.context ?? fileConfig.context,
    license: fileConfig.license,
  };

  validate(config);

  return config;
}
