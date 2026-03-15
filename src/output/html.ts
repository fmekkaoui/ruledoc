import { buildTree, capitalize } from "../tree.js";
import type { Rule, RuleWarning } from "../types.js";
import { DEFAULT_SEVERITY_DISPLAY, SEVERITY_DISPLAY } from "../types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sevColor(s: string): string {
  return SEVERITY_DISPLAY[s]?.color ?? DEFAULT_SEVERITY_DISPLAY.color;
}

function sevLabel(s: string): string {
  return SEVERITY_DISPLAY[s]?.label || s;
}

export function generateHTML(rules: Rule[], warnings: RuleWarning[]): string {
  const tree = buildTree(rules);
  const scopes = Object.keys(tree).sort();
  const totalCritical = rules.filter((r) => r.severity === "critical").length;
  const totalWarning = rules.filter((r) => r.severity === "warning").length;
  const date = new Date().toISOString().split("T")[0];

  // Build rules HTML
  const rulesChunks: string[] = [];
  for (const s of scopes) {
    const subs = Object.keys(tree[s]).sort();
    const all = subs.flatMap((sub) => tree[s][sub]);
    const cc = all.filter((r) => r.severity === "critical").length;

    rulesChunks.push(`<div class="scope" data-scope="${esc(s)}">`);
    rulesChunks.push(
      `<h2>${esc(capitalize(s))}${cc ? ` <span class="badge critical">${cc} critical</span>` : ""}</h2>`,
    );

    for (const sub of subs) {
      if (sub !== "_general") rulesChunks.push(`<h3>${esc(capitalize(sub))}</h3>`);

      for (const r of tree[s][sub]) {
        rulesChunks.push(`<div class="rule" data-severity="${r.severity}" data-scope="${esc(r.fullScope)}">`);
        rulesChunks.push(`<div class="rule-header">`);
        rulesChunks.push(
          `<span class="sev-dot" style="background:${sevColor(r.severity)}" title="${sevLabel(r.severity)}"></span>`,
        );
        if (r.severity !== "info") {
          rulesChunks.push(`<span class="sev-tag" style="color:${sevColor(r.severity)}">[${r.severity}]</span> `);
        }
        rulesChunks.push(`<span class="rule-desc">${esc(r.description)}</span>`);
        if (r.ticket) rulesChunks.push(` <code class="ticket">${esc(r.ticket)}</code>`);
        rulesChunks.push(`</div>`);
        rulesChunks.push(`<div class="rule-meta">📍 <code>${esc(r.file)}:${r.line}</code></div>`);
        if (r.codeContext) {
          rulesChunks.push(`<div class="rule-code"><code>${esc(r.codeContext)}</code></div>`);
        }
        rulesChunks.push(`</div>`);
      }
    }
    rulesChunks.push(`</div>`);
  }
  const rulesHTML = rulesChunks.join("");

  // Warnings HTML
  const warningsChunks: string[] = [];
  if (warnings.length > 0) {
    warningsChunks.push(`<div class="warnings-section"><h2>⚠️ Warnings (${warnings.length})</h2>`);
    for (const w of warnings) {
      warningsChunks.push(`<div class="warning-item"><code>${esc(w.file)}:${w.line}</code> — ${esc(w.message)}</div>`);
    }
    warningsChunks.push(`</div>`);
  }
  const warningsHTML = warningsChunks.join("");

  // Scope filter buttons
  const filterChunks: string[] = [`<button class="filter-btn active" data-filter="all">All (${rules.length})</button>`];
  for (const s of scopes) {
    const cnt = Object.keys(tree[s]).reduce((n, sub) => n + tree[s][sub].length, 0);
    filterChunks.push(`<button class="filter-btn" data-filter="${esc(s)}">${esc(capitalize(s))} (${cnt})</button>`);
  }
  const filterHTML = filterChunks.join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Business Rules — ${date}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; padding: 2rem; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.8rem; margin-bottom: 0.25rem; color: #f8fafc; }
  .subtitle { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .stat { background: #1e293b; border-radius: 8px; padding: 0.75rem 1.25rem; font-size: 0.85rem; }
  .stat strong { font-size: 1.3rem; display: block; }
  .search-bar { width: 100%; padding: 0.65rem 1rem; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 0.95rem; margin-bottom: 1rem; outline: none; }
  .search-bar:focus { border-color: #3b82f6; }
  .filters { display: flex; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .filter-btn { padding: 0.35rem 0.75rem; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #94a3b8; cursor: pointer; font-size: 0.8rem; transition: all 0.15s; }
  .filter-btn:hover { border-color: #3b82f6; color: #e2e8f0; }
  .filter-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .sev-filters { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  .sev-btn { padding: 0.3rem 0.65rem; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #94a3b8; cursor: pointer; font-size: 0.78rem; }
  .sev-btn:hover { color: #e2e8f0; }
  .sev-btn.active { border-color: currentColor; }
  .scope { margin-bottom: 2rem; }
  h2 { font-size: 1.3rem; color: #f1f5f9; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #1e293b; }
  h3 { font-size: 1rem; color: #94a3b8; margin: 1rem 0 0.5rem; }
  .badge { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 500; }
  .badge.critical { background: #7f1d1d; color: #fca5a5; }
  .rule { background: #1e293b; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 0.5rem; border-left: 3px solid #334155; transition: border-color 0.15s; }
  .rule:hover { border-left-color: #3b82f6; }
  .rule[data-severity="critical"] { border-left-color: #ef4444; }
  .rule[data-severity="warning"] { border-left-color: #eab308; }
  .rule-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .sev-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .sev-tag { font-size: 0.75rem; font-weight: 600; }
  .rule-desc { font-weight: 500; }
  .ticket { font-size: 0.75rem; background: #334155; padding: 0.1rem 0.4rem; border-radius: 4px; color: #94a3b8; }
  .rule-meta { font-size: 0.78rem; color: #64748b; margin-top: 0.35rem; }
  .rule-meta code { color: #94a3b8; }
  .rule-code { margin-top: 0.35rem; }
  .rule-code code { font-size: 0.78rem; color: #a5b4fc; }
  .hidden { display: none !important; }
  .no-results { text-align: center; color: #64748b; padding: 3rem 0; }
  .warnings-section { margin-top: 2rem; padding: 1rem; background: #1c1917; border: 1px solid #78350f; border-radius: 8px; }
  .warnings-section h2 { font-size: 1rem; color: #fbbf24; border: none; padding: 0; margin-bottom: 0.5rem; }
  .warning-item { font-size: 0.8rem; color: #d6d3d1; padding: 0.3rem 0; }
  .warning-item code { color: #fbbf24; }
  footer { text-align: center; color: #475569; font-size: 0.75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #1e293b; }
</style>
</head>
<body>
  <h1>Business Rules</h1>
  <p class="subtitle">Auto-generated by ruledoc — ${date}</p>

  <div class="stats">
    <div class="stat"><strong>${rules.length}</strong>rules</div>
    <div class="stat"><strong>${scopes.length}</strong>scopes</div>
    ${totalCritical ? `<div class="stat" style="border-left:3px solid #ef4444"><strong>${totalCritical}</strong>critical</div>` : ""}
    ${totalWarning ? `<div class="stat" style="border-left:3px solid #eab308"><strong>${totalWarning}</strong>warning</div>` : ""}
  </div>

  <input type="text" class="search-bar" id="search" placeholder="Search rules..." autocomplete="off">
  <div class="filters" id="scopeFilters">${filterHTML}</div>
  <div class="sev-filters" id="sevFilters">
    <button class="sev-btn active" data-sev="all">All severities</button>
    <button class="sev-btn" data-sev="critical" style="color:#ef4444">Critical (${totalCritical})</button>
    <button class="sev-btn" data-sev="warning" style="color:#eab308">Warning (${totalWarning})</button>
    <button class="sev-btn" data-sev="info" style="color:#3b82f6">Info (${rules.length - totalCritical - totalWarning})</button>
  </div>

  <div id="rules">${rulesHTML}</div>
  <div class="no-results hidden" id="noResults">No rules match your search.</div>

  ${warningsHTML}

  <footer>Generated by <strong>ruledoc</strong> · ${rules.length} rules · ${date}</footer>

<script>
(function() {
  const search = document.getElementById('search');
  const scopeBtns = document.querySelectorAll('.filter-btn');
  const sevBtns = document.querySelectorAll('.sev-btn');
  const allRules = document.querySelectorAll('.rule');
  const allScopes = document.querySelectorAll('.scope');
  const noResults = document.getElementById('noResults');

  let activeScope = 'all';
  let activeSev = 'all';

  function filter() {
    const q = search.value.toLowerCase();
    let visible = 0;

    allRules.forEach(function(rule) {
      const text = rule.textContent.toLowerCase();
      const scope = rule.dataset.scope.split('.')[0];
      const sev = rule.dataset.severity;

      const matchSearch = !q || text.includes(q);
      const matchScope = activeScope === 'all' || scope === activeScope;
      const matchSev = activeSev === 'all' || sev === activeSev;

      if (matchSearch && matchScope && matchSev) {
        rule.classList.remove('hidden');
        visible++;
      } else {
        rule.classList.add('hidden');
      }
    });

    allScopes.forEach(function(s) {
      var hasVisible = s.querySelector('.rule:not(.hidden)');
      s.classList.toggle('hidden', !hasVisible);
    });

    noResults.classList.toggle('hidden', visible > 0);
  }

  search.addEventListener('input', filter);

  scopeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      scopeBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeScope = btn.dataset.filter;
      filter();
    });
  });

  sevBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      sevBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeSev = btn.dataset.sev;
      filter();
    });
  });
})();
</script>
</body>
</html>`;
}
