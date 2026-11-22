import { createHash } from "node:crypto";
import { sha256 } from "./delivery";
import { readFile, writeFile } from "./files";
import { relativePath, type Manifest, type RenderedResource } from "./inputs";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escape(value: string): string {
  return value.replace(/[&<>"']/g, character => entities[character]);
}

function commitLink({ repository, revision }: Manifest["upstream"]): string | undefined {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(revision)) return;
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    return;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return;
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\.git$/, "")}/commit/${revision}`;
  url.search = "";
  url.hash = "";
  return url.href;
}

const integrityLabels = {
  match: "Matches expected bytes",
  missing: "Missing output",
  drift: "Byte drift",
  unreadable: "Unreadable output",
} as const;

type OutputInspection = { state: "match" | "missing" | "unreadable" } | { state: "drift"; observed: Buffer };

function inspectOutput(root: string, output: string, expected: Buffer): OutputInspection {
  let observed: Buffer | undefined;
  try {
    observed = readFile(root, output);
  } catch {
    return { state: "unreadable" };
  }
  if (!observed) return { state: "missing" };
  if (observed.equals(expected)) return { state: "match" };
  return { state: "drift", observed };
}

function code(value: string): string {
  // The HTML parser normalizes literal CR and NUL even inside preformatted text.
  return escape(value).replace(/\r/g, "␍").replace(/\0/g, "␀");
}

function snippet(value: string): string {
  return value === "" ? '<p class="empty">No text</p>' : `<pre><code>${code(value)}</code></pre>`;
}

function comparison(resource: RenderedResource): string {
  const mapped = resource.bytes.toString("utf8");
  const before: string[] = [];
  const after: string[] = [];
  let beforeEnd = 0;
  let afterEnd = 0;
  // Only decorate spans the renderer already resolved; the mapped side comes from its bytes.
  for (const edit of resource.edits) {
    const mappedStart = afterEnd + edit.start - beforeEnd;
    before.push(code(resource.original.slice(beforeEnd, edit.start)), `<del>${code(edit.before)}</del>`);
    beforeEnd = edit.start + edit.before.length;
    after.push(code(mapped.slice(afterEnd, mappedStart)));
    afterEnd = mappedStart + edit.after.length;
    if (edit.after) after.push(`<ins>${code(mapped.slice(mappedStart, afterEnd))}</ins>`);
  }
  before.push(code(resource.original.slice(beforeEnd)));
  after.push(code(mapped.slice(afterEnd)));
  return `<details><summary>Full file comparison</summary>
  <div class="pair">
    <figure><figcaption>Upstream snapshot</figcaption><pre><code>${before.join("")}</code></pre></figure>
    <figure><figcaption>Mapped result</figcaption><pre><code>${after.join("")}</code></pre></figure>
  </div></details>`;
}

function operations(resource: RenderedResource): string {
  let line = 1;
  let offset = 0;
  const items = resource.edits.map(edit => {
    while (offset < edit.start) if (resource.original[offset++] === "\n") line++;
    return `<li class="operation">
      <h4><code>${escape(edit.name)}</code></h4>
      <p>${escape(edit.reason)}</p>
      <details><summary>Anchor <span class="muted">· edit starts on upstream line ${line}</span></summary>${snippet(edit.anchor)}</details>
      <div class="pair">
        <figure class="removed"><figcaption>Before <span class="muted">· upstream</span></figcaption>${snippet(edit.before)}</figure>
        <figure class="added"><figcaption>After <span class="muted">· mapped</span></figcaption>${snippet(edit.after)}</figure>
      </div>
    </li>`;
  });
  return `${comparison(resource)}<h3>Mapping operations <span class="count">${items.length}</span></h3><ol class="operations">${items.join("\n")}</ol>`;
}

function integrity(state: OutputInspection, expected: Buffer, binary: boolean): string {
  const { state: status } = state;
  const expectedHash = binary || status !== "match"
    ? `<dt>Expected SHA-256</dt><dd><code>${sha256(expected)}</code></dd>` : "";
  const observed = status === "drift"
    ? `<dt>Observed size</dt><dd>${state.observed.length.toLocaleString("en-US")} bytes</dd>
       <dt>Observed SHA-256</dt><dd><code>${sha256(state.observed)}</code></dd>` : "";
  return `<p class="integrity" data-state="${status}"><strong>${integrityLabels[status]}</strong>${status === "unreadable" ? " · could not read a regular file safely" : ""}</p>
    <dl><dt>Expected size</dt><dd>${expected.length.toLocaleString("en-US")} bytes</dd>${expectedHash}${observed}</dl>`;
}

const styles = `
:root {
  color-scheme: light;
  --ground: #f2f4f7; --surface: #fff; --raised: #eee; --border: #e6e6e6; --rule: #f0f0f0;
  --control: #888; --text: #0a0a0a; --muted: #595959; --negative: #a52227; --data: #1d5fbf;
  --radius: 8px; --control-radius: 6px; --gap: 12px;
  font: 14px/1.5 Geist, system-ui, sans-serif; color: var(--text); background: var(--ground);
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
body, h1, h2, h3, h4, p, figure, pre, dl, dd { margin: 0; }
code, pre { font-family: 'Geist Mono', ui-monospace, Consolas, monospace; }
a { color: inherit; text-underline-offset: .2em; }
:focus-visible { outline: 2px solid var(--data); outline-offset: 2px; }
.frame { width: min(1088px, calc(100% - 48px)); margin-inline: auto; }
.bar { border-bottom: 1px solid var(--border); }
.brand { min-height: 48px; display: flex; align-items: center; gap: 10px; font-weight: 600; }
main { padding-block: 32px; }
h1 { font-size: 24px; line-height: 1.2; font-weight: 600; }
h2, h3 { font-size: 16px; font-weight: 600; }
h4 { font-size: 14px; font-weight: 600; }
.muted, dt, figcaption, .count { color: var(--muted); }
.provenance { margin-block: 12px; }
dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; }
dd, code, h2, h4 { overflow-wrap: anywhere; }
.notice { margin-block: 12px; padding: 8px 12px; border-inline-start: 2px solid var(--control); color: var(--muted); }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gap); margin-bottom: 24px; }
.stats > div, .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.stats > div { padding: 10px 14px; }
.stats dt { font-size: 12px; }
.stats dd { font-size: 20px; font-variant-numeric: tabular-nums; }
.stats .attention { color: var(--negative); }
/* 1088px = 260px ledger + 12px gutter + 816px detail, including the panel edges. */
.workspace { display: grid; grid-template-columns: 260px minmax(0, 1fr); align-items: start; gap: var(--gap); }
nav { position: sticky; top: 12px; padding: 12px; min-width: 0; }
.search { margin-block: 8px; }
.search label { display: block; margin-bottom: 4px; }
.search input { width: 100%; min-height: 36px; padding: 6px 10px; background: var(--surface); color: var(--text);
  border: 1px solid var(--control); border-radius: var(--control-radius); font: inherit; }
#file-count { color: var(--muted); font-size: 12px; margin-top: 4px; }
.file-list { list-style: none; margin: 0; padding: 3px; max-height: 58vh; overflow-y: auto; }
.file-list li + li { border-top: 1px solid var(--rule); }
.file-list a, .back { display: block; padding: 7px 8px; min-height: 44px; border-radius: var(--control-radius); }
.file-list a { text-decoration: none; }
.file-list a:hover code { text-decoration: underline; }
.file-list a[aria-current] { background: var(--raised); }
.file-list small { display: block; color: var(--muted); font-size: 12px; }
.file-list [data-state]:not([data-state="match"]) { color: var(--negative); }
article { padding: 16px; scroll-margin-top: 12px; }
article + article { margin-top: var(--gap); }
.file-type { margin-block: 4px 12px; color: var(--muted); }
.integrity { margin-block: 12px 4px; }
.integrity:not([data-state="match"]) { color: var(--negative); }
.evidence { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.count { padding-left: 4px; font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.operations { margin: 0; padding: 0; list-style: none; }
.operation { padding-block: 12px; border-bottom: 1px solid var(--rule); }
.operation p { margin-block: 4px 10px; }
.pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap); margin-top: 8px; }
figcaption { font-size: 12px; margin-bottom: 4px; }
pre, .empty { padding: 8px 10px; background: var(--ground); border-radius: var(--control-radius); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; }
.empty { color: var(--muted); }
.added figcaption, ins { color: var(--data); }
.removed figcaption, del { color: var(--negative); }
summary { cursor: pointer; padding: 10px 0; }
.back { display: none; }
@media (max-width: 1100px) {
  .pair { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .frame { width: calc(100% - 32px); }
  main { padding-block: 20px; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 12px; }
  .workspace, .pair { grid-template-columns: minmax(0, 1fr); }
  nav { position: static; }
  .file-list { max-height: 220px; }
  .search input, summary { min-height: 44px; }
  .search input { font-size: 16px; }
  .back { display: inline-flex; align-items: center; margin-top: 8px; }
}
`;

const script = `
(() => {
  const links = [...document.querySelectorAll('.file-list a')];
  if (!links.length) return;
  const files = links.map(link => ({ link, detail: document.getElementById(link.hash.slice(1)),
    paths: [link.querySelector('code').textContent.toLowerCase(), link.dataset.source.toLowerCase()] }));
  const input = document.getElementById('file-search');
  const count = document.getElementById('file-count');
  let selected;
  function select(hash) {
    const next = files.find(file => file.link.hash === hash);
    if (!next) return;
    if (selected) {
      selected.link.removeAttribute('aria-current');
      selected.detail.hidden = true;
    }
    next.detail.hidden = false;
    next.link.setAttribute('aria-current', 'location');
    selected = next;
  }
  for (const file of files) file.detail.hidden = true;
  select(location.hash);
  if (!selected) select((files.find(file => file.detail.dataset.mapped === 'true') || files[0]).link.hash);
  for (const { link } of files) link.addEventListener('click', event => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) select(link.hash);
  });
  window.addEventListener('hashchange', () => select(location.hash));
  function filter() {
    const query = input.value.trim().toLowerCase();
    let matching = 0;
    for (const { link, paths } of files) {
      const visible = paths.some(path => path.includes(query));
      link.parentElement.hidden = !visible;
      if (visible) matching++;
    }
    count.textContent = matching ? matching + ' of ' + files.length + ' files' : 'No files match this search.';
  }
  filter();
  input.addEventListener('input', filter);
  document.querySelector('.search').hidden = false;
})();`;

export function writeMappingHtml(root: string, manifest: Manifest, delivery: readonly RenderedResource[], effects: string[]): void {
  const specifications = new Map(manifest.files.map(file => [file.output, file]));
  let mapped = 0;
  let matching = 0;
  const links: string[] = [];
  const details: string[] = [];
  for (const [index, resource] of delivery.entries()) {
    const spec = specifications.get(resource.output);
    if (!spec) throw new Error(`${resource.output}: missing mapping report manifest entry`);
    const id = `file-${index + 1}`;
    const output = `generated/${relativePath(resource.output, "mapping report output")}`;
    const observed = inspectOutput(root, output, resource.bytes);
    const binary = spec.kind === "binary";
    const runtime = spec.origin === "runtime";
    const changed = resource.edits.length > 0;
    const type = runtime ? "Local runtime" : binary ? "Binary copy" : changed ? "Mapped text" : "Unchanged text";
    if (changed) mapped++;
    if (observed.state === "match") matching++;
    const source = `${runtime ? "runtime" : "upstream"}/${escape(resource.source)}`;
    links.push(`<li><a href="#${id}" data-source="${source}"><code>${escape(resource.output)}</code><small>${type}${observed.state === "match" ? "" : ` · <span data-state="${observed.state}">${integrityLabels[observed.state]}</span>`}</small></a></li>`);
    const evidence = changed ? operations(resource)
      : binary ? `<p>${runtime ? "Local binary; there is no upstream comparison." : "Binary bytes are copied without a text diff."}</p>`
      : `<p>${runtime ? "Authored locally; there is no upstream comparison." : "No mapping edits. Text is compared after CRLF-to-LF normalization."}</p>
         <details><summary>${runtime ? "Local runtime text" : "Unchanged text content"}</summary>${snippet(resource.original)}</details>`;
    details.push(`<article class="panel" id="${id}" tabindex="-1" data-mapped="${changed}">
      <h2><code>${escape(resource.output)}</code></h2>
      <a class="back" href="#files-heading">Back to files</a>
      <p class="file-type">${type}</p>
      <dl>
        <dt>${runtime ? "Local source" : "Upstream source"}</dt><dd><code>${source}</code></dd>
        <dt>Output</dt><dd><code>${escape(output)}</code></dd>
        ${resource.mapping ? `<dt>Mapping</dt><dd><code>mappings/${escape(resource.mapping)}</code></dd>` : ""}
      </dl>
      ${integrity(observed, resource.bytes, binary)}
      <div class="evidence">${evidence}</div>
    </article>`);
  }
  const { upstream } = manifest;
  const href = commitLink(upstream);
  const revision = `<code>${escape(upstream.revision)}</code>`;
  const attention = delivery.length - matching;
  const scriptHash = createHash("sha256").update(script).digest("base64");
  const bytes = Buffer.from(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'">
<title>Mapping report · pstack-suite</title>
<style>${styles}</style>
</head>
<body>
<header class="bar"><div class="frame brand">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 4h6l4 6h6M2 10h6l4 6h6M2 16h5"/></svg>
  pstack-suite
</div></header>
<main class="frame">
  <h1>Mapping report</h1>
  <dl class="provenance">
    <dt>Repository</dt><dd>${escape(upstream.repository)}</dd>
    <dt>Version</dt><dd>${escape(upstream.version)}</dd>
    <dt>Commit</dt><dd>${href ? `<a href="${escape(href)}" rel="noreferrer">${revision}</a>` : revision}</dd>
  </dl>
  <p class="notice"><strong>Static snapshot.</strong> Output bytes were inspected when this report was generated. Rebuild to refresh it.</p>
  <dl class="stats">
    <div><dt>Generated files</dt><dd>${delivery.length}</dd></div>
    <div><dt>Files with mappings</dt><dd>${mapped}</dd></div>
    <div><dt>Matching outputs</dt><dd>${matching}</dd></div>
    <div><dt>Outputs to review</dt><dd${attention ? ' class="attention"' : ""}>${attention}</dd></div>
  </dl>
  <div class="workspace">
    <nav class="panel" aria-labelledby="files-heading">
      <h2 id="files-heading" tabindex="-1">Files</h2>
      <div class="search" hidden><label for="file-search">Search file paths</label><input id="file-search" type="search" autocomplete="off" aria-controls="file-list"><p id="file-count" role="status"></p></div>
      ${links.length ? `<ul id="file-list" class="file-list">${links.join("\n")}</ul>` : "<p>No files in this build.</p>"}
    </nav>
    <div>${details.join("\n")}</div>
  </div>
</main>
<script>${script}</script>
</body>
</html>
`);
  if (!readFile(root, "mapping.html")?.equals(bytes)) writeFile(root, "mapping.html", bytes, effects);
}
