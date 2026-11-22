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

function lines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function lineCode(value: string): string {
  const terminated = value.endsWith("\n");
  return code(terminated ? value.slice(0, -1) : value) + (terminated ? "" : '<span class="eof"> · No newline at end of file</span>');
}

function opButton(id: string, name: string): string {
  return `<button type="button" class="op-chip" data-op="${id}">${escape(name)}</button>`;
}

function comparison(resource: RenderedResource, id: string): string {
  // Group resolved edits by affected source lines; do not match anchors again.
  const original = resource.original;
  const mapped = resource.bytes.toString("utf8");
  const groups: { start: number; end: number; delta: number; ops: number[] }[] = [];
  resource.edits.forEach((edit, index) => {
    const start = edit.start === 0 ? 0 : original.lastIndexOf("\n", edit.start - 1) + 1;
    const last = edit.start + Math.max(0, edit.before.length - 1);
    const searchFrom = original[last] === "\n" && !edit.after.endsWith("\n") ? last + 1 : last;
    const newline = original.indexOf("\n", searchFrom);
    const end = newline < 0 ? original.length : newline + 1;
    const delta = edit.after.length - edit.before.length;
    const previous = groups[groups.length - 1];
    if (previous && start < previous.end) {
      previous.end = Math.max(previous.end, end);
      previous.delta += delta;
      previous.ops.push(index);
    } else groups.push({ start, end, delta, ops: [index] });
  });
  const unified: string[] = [];
  const split: string[] = [];
  let oldLine = 1, newLine = 1, offset = 0, delta = 0;
  const cell = (value: string | undefined, number: number | undefined, kind: string) =>
    `<div class="cell ${kind}"><span class="ln">${number ?? ""}</span><code>${value === undefined ? "" : lineCode(value)}</code></div>`;
  function context(value: string) {
    for (const line of lines(value)) {
      unified.push(`<div class="row context"><span class="ln">${oldLine}</span><span class="ln">${newLine}</span><span class="sign"> </span><code>${lineCode(line)}</code></div>`);
      split.push(`<div class="srow">${cell(line, oldLine, "context")}${cell(line, newLine, "context")}</div>`);
      oldLine++; newLine++;
    }
  }
  for (const group of groups) {
    context(original.slice(offset, group.start));
    const heading = `<div class="hunk">${group.ops.map(index => opButton(`${id}-op-${index}`, resource.edits[index].name)).join(" ")}</div>`;
    unified.push(heading); split.push(heading);
    const before = lines(original.slice(group.start, group.end));
    const after = lines(mapped.slice(group.start + delta, group.end + delta + group.delta));
    before.forEach((line, index) => unified.push(`<div class="row removed"><span class="ln">${oldLine + index}</span><span class="ln"></span><span class="sign">−</span><code>${lineCode(line)}</code></div>`));
    after.forEach((line, index) => unified.push(`<div class="row added"><span class="ln"></span><span class="ln">${newLine + index}</span><span class="sign">+</span><code>${lineCode(line)}</code></div>`));
    for (let index = 0; index < Math.max(before.length, after.length); index++) {
      split.push(`<div class="srow">${cell(before[index], index < before.length ? oldLine + index : undefined, "removed")}${cell(after[index], index < after.length ? newLine + index : undefined, "added")}</div>`);
    }
    oldLine += before.length; newLine += after.length;
    offset = group.end; delta += group.delta;
  }
  context(original.slice(offset));
  return `<div class="diff unified" aria-label="Unified diff">${unified.join("")}</div><div class="diff split" aria-label="Split diff"><div class="split-label"><span>Upstream snapshot</span><span>Mapped result</span></div>${split.join("")}</div>`;
}

function operations(resource: RenderedResource, id: string): string {
  let line = 1;
  let offset = 0;
  return resource.edits.map((edit, index) => {
    while (offset < edit.start) if (resource.original[offset++] === "\n") line++;
    const opId = `${id}-op-${index}`;
    return `<dialog id="${opId}" aria-labelledby="${opId}-title">
      <header class="drawer-head"><h2 id="${opId}-title"><code>${escape(edit.name)}</code></h2><button type="button" data-close>Close</button></header>
      <div class="drawer-body"><p>${escape(edit.reason)}</p><p class="muted">${escape(resource.output)} · upstream line ${line}</p>
      <h3>Anchor</h3>${snippet(edit.anchor)}
      <h3>Before · upstream</h3><div class="removed">${snippet(edit.before)}</div>
      <h3>After · mapped</h3><div class="added">${snippet(edit.after)}</div>
      <h3>Defined in</h3><code>mappings/${escape(resource.mapping ?? "")}</code></div>
    </dialog>`;
  }).join("\n");
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
:root { color-scheme: light; --bg:#fff; --subtle:#f6f8fa; --border:#d0d7de; --fg:#1f2328; --muted:#4b5561; --accent:#0969da; --add:#e6ffec; --del:#ffebe9; --add-fg:#1a7f37; --del-fg:#b62324; --chip:#ddf4ff; --bar-height:96px; font:14px/1.5 system-ui,sans-serif; }
:root[data-theme="dark"] { color-scheme:dark; --bg:#101010; --subtle:#191919; --border:#383838; --fg:#ededed; --muted:#acacac; --accent:#75b6ff; --add:#122b1c; --del:#32191a; --add-fg:#75d894; --del-fg:#ff9292; --chip:#16334d; }
* { box-sizing:border-box; }
[hidden] { display:none !important; }
body { margin:0; background:var(--bg); color:var(--fg); }
h1,h2,h3,p,pre,dl,dd { margin:0; }
h1 { font-size:14px; font-weight:600; }
h2 { font-size:14px; } h3 { font-size:13px; margin:20px 0 8px; }
code,pre { font-family:ui-monospace,Consolas,monospace; font-size:13px; }
a { color:var(--accent); }
button,input { font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:5px 10px; }
button { cursor:pointer; font-size:12px; min-height:30px; } button:hover { background:var(--subtle); }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.muted,dt,.stats,.eof { color:var(--muted); }
.topbar { position:sticky; top:0; z-index:10; background:var(--subtle); border-bottom:1px solid var(--border); padding:10px 16px; }
.toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; }
.controls { display:flex; gap:8px; margin-left:auto; align-items:center; }
.segmented { display:flex; } .segmented button { border-radius:0; } .segmented button:first-child { border-radius:6px 0 0 6px; } .segmented button:last-child { border-radius:0 6px 6px 0; margin-left:-1px; }
button[aria-pressed="true"] { background:var(--accent); color:var(--bg); border-color:var(--accent); }
.stats { font-size:12px; }
.provenance { display:flex; flex-wrap:wrap; align-items:center; gap:4px 14px; margin-top:8px; font-size:12px; }
.provenance summary { cursor:pointer; } .provenance details p { margin-top:6px; }
.workspace { display:grid; grid-template-columns:300px minmax(0,1fr); align-items:start; }
nav { position:sticky; top:var(--bar-height); height:calc(100dvh - var(--bar-height)); overflow:auto; padding:16px; background:var(--subtle); border-right:1px solid var(--border); }
nav h2 { margin-bottom:8px; } .search label { display:block; font-size:12px; } .search input { width:100%; margin:4px 0; } #file-count { font-size:12px; color:var(--muted); margin-bottom:12px; }
.file-list { list-style:none; padding:0; margin:0; } .file-list li { margin-bottom:12px; }
.file-list a { display:block; padding:5px 6px; color:var(--fg); text-decoration:none; border-radius:6px; overflow-wrap:anywhere; }
.file-list a[aria-current],.file-list a:hover { background:var(--border); }
.file-list small { display:block; color:var(--muted); font-size:11px; }
.nav-ops { display:flex; flex-wrap:wrap; gap:4px; padding:4px 6px; }
.op-chip { font-family:ui-monospace,Consolas,monospace; font-size:11px; border-radius:20px; padding:2px 7px; min-height:24px; overflow-wrap:anywhere; max-width:100%; }
.hunk .op-chip { background:var(--chip); color:var(--accent); border-color:transparent; }
.main { padding:16px; min-width:0; }
article { border:1px solid var(--border); border-radius:8px; overflow:hidden; scroll-margin-top:calc(var(--bar-height) + 12px); margin-bottom:24px; }
.file-head { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; padding:8px 12px; background:var(--subtle); border-bottom:1px solid var(--border); }
.file-head h2 { overflow-wrap:anywhere; } .file-head .file-type { font-size:12px; color:var(--muted); }
.file-meta { padding:8px 12px; border-bottom:1px solid var(--border); font-size:12px; } .file-meta summary { cursor:pointer; }
dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:4px 12px; margin-block:8px; } dd { overflow-wrap:anywhere; }
.integrity[data-state="match"] { color:var(--muted); } .integrity:not([data-state="match"]),[data-state="missing"],[data-state="drift"],[data-state="unreadable"] { color:var(--del-fg); }
.back { display:none; }
.diff { font:12px/1.65 ui-monospace,Consolas,monospace; }
.row { display:grid; grid-template-columns:42px 42px 20px minmax(0,1fr); }
.row code,.cell code { padding:2px 8px; white-space:pre-wrap; overflow-wrap:anywhere; min-height:24px; tab-size:4; }
.ln { color:var(--muted); text-align:right; padding:2px 8px; border-right:1px solid var(--border); user-select:none; font-variant-numeric:tabular-nums; }
.sign { text-align:center; padding-block:2px; }
.removed { background:var(--del); } .added { background:var(--add); }
.hunk { padding:5px 12px 5px 104px; background:var(--subtle); border-block:1px solid var(--border); }
.srow,.split-label { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.cell { display:grid; grid-template-columns:42px minmax(0,1fr); } .cell:first-child { border-right:1px solid var(--border); }
.split-label { padding:6px 12px; color:var(--muted); background:var(--subtle); }
.split { display:none; } body[data-view="split"] .unified { display:none; } body[data-view="split"] .split { display:block; }
.eof { font-size:11px; font-style:italic; } .plain { padding:12px; } .plain pre { white-space:pre-wrap; overflow-wrap:anywhere; }
dialog { position:fixed; inset:0 0 0 auto; margin:0; height:100dvh; max-height:100dvh; width:min(620px,100%); max-width:100%; padding:0; border:0; border-left:1px solid var(--border); background:var(--bg); color:var(--fg); }
dialog::backdrop { background:rgb(0 0 0 / .18); }
.drawer-head { position:sticky; top:0; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--border); background:var(--subtle); } .drawer-head h2 { overflow-wrap:anywhere; }
.drawer-body { padding:16px; } .drawer-body p + p { margin-top:8px; } .drawer-body pre { white-space:pre-wrap; overflow-wrap:anywhere; padding:12px; border:1px solid var(--border); border-radius:6px; }
.empty { padding:12px; }
@media(max-width:760px) {
  .topbar { position:static; padding:10px 16px; } .controls { margin-left:0; width:100%; } button { min-height:44px; }
  .workspace { grid-template-columns:minmax(0,1fr); } nav { position:static; height:auto; max-height:320px; border-right:0; border-bottom:1px solid var(--border); }
  .main { padding:16px; } article { scroll-margin-top:12px; } .file-list a { min-height:44px; } .op-chip { min-height:32px; }
  .back { display:inline-block; padding:8px 0; } .row { grid-template-columns:30px 30px 18px minmax(0,1fr); } .ln { padding-inline:4px; } .hunk { padding-left:12px; }
  .search input { min-height:44px; font-size:16px; } .srow { grid-template-columns:minmax(0,1fr); } .cell:first-child { border-right:0; } .split-label { display:none; }
}
`;

const script = `
(() => {
  const links = [...document.querySelectorAll('.file-list a')];
  const files = links.map(link => ({ link, detail: document.getElementById(link.hash.slice(1)),
    paths: [link.querySelector('code').textContent.toLowerCase(), link.dataset.source.toLowerCase()] }));
  const input = document.getElementById('file-search');
  const count = document.getElementById('file-count');
  let selected;
  function select(hash) {
    const next = files.find(file => file.link.hash === hash);
    if (!next) return;
    if (selected) { selected.link.removeAttribute('aria-current'); selected.detail.hidden = true; }
    next.detail.hidden = false;
    next.link.setAttribute('aria-current', 'location');
    selected = next;
  }
  for (const file of files) file.detail.hidden = true;
  select(location.hash);
  if (!selected && files.length) select((files.find(file => file.detail.dataset.mapped === 'true') || files[0]).link.hash);
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
  filter(); input.addEventListener('input', filter);
  document.querySelector('.search').hidden = false;
  for (const button of document.querySelectorAll('[data-view-button]')) button.addEventListener('click', () => {
    document.body.dataset.view = button.dataset.viewButton;
    for (const sibling of document.querySelectorAll('[data-view-button]')) sibling.setAttribute('aria-pressed', String(sibling === button));
  });
  const media = matchMedia('(prefers-color-scheme: dark)');
  const theme = document.getElementById('theme');
  let mode = 'Auto';
  function applyTheme() { document.documentElement.dataset.theme = mode === 'Auto' ? (media.matches ? 'dark' : 'light') : mode.toLowerCase(); theme.textContent = 'Theme: ' + mode; }
  theme.addEventListener('click', () => { mode = mode === 'Auto' ? 'Light' : mode === 'Light' ? 'Dark' : 'Auto'; applyTheme(); });
  media.addEventListener('change', applyTheme); applyTheme();
  for (const button of document.querySelectorAll('[data-op]')) button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.op);
    const article = dialog.closest('article');
    select('#' + article.id);
    dialog.showModal();
  });
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
  const bar = document.querySelector('.topbar');
  new ResizeObserver(() => document.documentElement.style.setProperty('--bar-height', bar.offsetHeight + 'px')).observe(bar);
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
    links.push(`<li><a href="#${id}" data-source="${source}"><code>${escape(resource.output)}</code><small>${type} · ${resource.edits.length} ops${observed.state === "match" ? "" : ` · <span data-state="${observed.state}">${integrityLabels[observed.state]}</span>`}</small></a><div class="nav-ops">${resource.edits.map((edit, index) => opButton(`${id}-op-${index}`, edit.name)).join(" ")}</div></li>`);
    const evidence = changed ? comparison(resource, id) + operations(resource, id)
      : binary ? `<p>${runtime ? "Local binary; there is no upstream comparison." : "Binary bytes are copied without a text diff."}</p>`
      : `<p>${runtime ? "Authored locally; there is no upstream comparison." : "No mapping edits. Text is compared after CRLF-to-LF normalization."}</p>
         <details><summary>${runtime ? "Local runtime text" : "Unchanged text content"}</summary>${snippet(resource.original)}</details>`;
    details.push(`<article class="panel" id="${id}" tabindex="-1" data-mapped="${changed}">
      <header class="file-head"><h2><code>${escape(resource.output)}</code></h2><span class="file-type">${type} · ${resource.edits.length} ops</span></header>
      <div class="file-meta"><a class="back" href="#files-heading">Back to files</a>
      <details><summary>Source &amp; output integrity · ${integrityLabels[observed.state]}</summary><dl>
        <dt>${runtime ? "Local source" : "Upstream source"}</dt><dd><code>${source}</code></dd>
        <dt>Output</dt><dd><code>${escape(output)}</code></dd>
        ${resource.mapping ? `<dt>Mapping</dt><dd><code>mappings/${escape(resource.mapping)}</code></dd>` : ""}
      </dl>
      ${integrity(observed, resource.bytes, binary)}</details></div>
      <div class="${changed ? "evidence" : "plain"}">${evidence}</div>
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
<body data-view="unified">
<header class="topbar">
  <div class="toolbar"><h1>pstack-suite <span class="muted">· mapping report</span></h1>
    <span class="stats">${delivery.length} files · ${mapped} mapped · ${matching} matching · ${attention} outputs to review</span>
    <div class="controls"><div class="segmented" aria-label="Diff layout"><button type="button" data-view-button="unified" aria-pressed="true">Unified</button><button type="button" data-view-button="split" aria-pressed="false">Split</button></div><button type="button" id="theme">Theme: Auto</button></div>
  </div>
  <div class="provenance"><span>${escape(upstream.version)}</span><span>${href ? `<a href="${escape(href)}" rel="noreferrer">${revision}</a>` : revision}</span><details><summary>Snapshot provenance</summary><p>${escape(upstream.repository)}</p><p>Static snapshot. Output bytes were inspected when this report was generated. Rebuild to refresh it.</p></details></div>
</header>
<main class="workspace">
  <nav aria-labelledby="files-heading">
    <h2 id="files-heading" tabindex="-1">Files</h2>
    <div class="search" hidden><label for="file-search">Search file paths</label><input id="file-search" type="search" autocomplete="off" aria-controls="file-list"><p id="file-count" role="status"></p></div>
    ${links.length ? `<ul id="file-list" class="file-list">${links.join("\n")}</ul>` : "<p>No files in this build.</p>"}
  </nav>
  <div class="main">${details.join("\n")}</div>
</main>
<script>${script}</script>
</body>
</html>
`);
  if (!readFile(root, "mapping.html")?.equals(bytes)) writeFile(root, "mapping.html", bytes, effects);
}
