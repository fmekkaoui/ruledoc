// ---------------------------------------------------------------------------
// Glob-to-regex converter (zero dependencies)
// ---------------------------------------------------------------------------

// @rule(ignore.glob, critical): Glob patterns must be converted to regex for file matching — supports **, *, ?, anchoring, and directory-only trailing slash
export function globToRegex(pattern: string): RegExp {
  let anchored = false;

  // Leading / means anchor to root
  if (pattern.startsWith("/")) {
    anchored = true;
    pattern = pattern.slice(1);
  }

  // Trailing / means directory-only — match anything inside
  const dirOnly = pattern.endsWith("/");
  if (dirOnly) {
    pattern = pattern.slice(0, -1);
  }

  // Escape regex special chars, then convert glob tokens
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // ** — match anything including /
      // Skip optional trailing /
      i += 2;
      if (pattern[i] === "/") i++;
      regex += ".*";
    } else if (ch === "*") {
      regex += "[^/]*";
      i++;
    } else if (ch === "?") {
      regex += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(ch)) {
      regex += "\\" + ch;
      i++;
    } else {
      regex += ch;
      i++;
    }
  }

  if (dirOnly) {
    regex += "(/.*)?";
  }

  // Anchor to root or allow match at any depth
  if (anchored) {
    regex = "^" + regex + "$";
  } else {
    regex = "^(.*/)?" + regex + "$";
  }

  return new RegExp(regex);
}

// @rule(ignore.glob): matchesAnyGlob tests a path against pre-compiled glob regexes for performance
export function matchesAnyGlob(path: string, regexes: RegExp[]): boolean {
  for (const re of regexes) {
    if (re.test(path)) return true;
  }
  return false;
}
