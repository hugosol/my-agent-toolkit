import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { render, type Manifest } from "../../pstack-suite/maintenance/inputs";
import { writeMappingHtml } from "../../pstack-suite/maintenance/mapping-html";

const upstream = {
  repository: "https://github.com/cursor/plugins",
  revision: "aaeb0ea3a0584995aa8f55ce44c6c5259414b896",
  version: "pstack 0.15.46",
};

function fixture(run: (root: string, put: (path: string, bytes: string | Uint8Array) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), "pstack mapping html "));
  try {
    run(root, (path, bytes) => {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function report(root: string, manifest: Manifest, effects: string[] = []) {
  writeMappingHtml(root, manifest, render(root, manifest.files), effects);
  return readFileSync(join(root, "mapping.html"), "utf8");
}

// A mapping's full anchor differs from its replaced span; keeping only that span loses attribution.
test("the report connects the pinned commit and mapped changes to their exact operations", () => fixture((root, put) => {
  const manifest: Manifest = {
    upstream,
    files: [{ source: "source.md", output: "delivered.md", kind: "text", mapping: "command.json" }],
  };
  put("upstream/source.md", "Keep this.\nInvoke `/original` manually.\nLeave this.\n");
  put("mappings/command.json", JSON.stringify([{
    name: "use-local-command",
    reason: "Use the local command entry point.",
    anchor: "Invoke `/original` manually.",
    find: "`/original`",
    replace: "`/replacement`",
  }]));
  put("generated/delivered.md", "Keep this.\nInvoke `/replacement` manually.\nLeave this.\n");

  const effects: string[] = [];
  const html = report(root, manifest, effects);
  expect(effects).toEqual(["Wrote mapping.html"]);
  expect(html).toContain('href="https://github.com/cursor/plugins/commit/aaeb0ea3a0584995aa8f55ce44c6c5259414b896"');
  expect(html).toContain("pstack 0.15.46");
  expect(html).toContain('href="#file-1"');
  expect(html).toContain("Upstream snapshot");
  expect(html).toContain("Mapped result");
  expect(html).toMatch(/use-local-command[\s\S]*Use the local command entry point\.[\s\S]*Anchor[\s\S]*Invoke `\/original` manually\.[\s\S]*Before[\s\S]*`\/original`[\s\S]*After[\s\S]*`\/replacement`/);
  expect(html).toContain("Matches expected bytes");
  const repeatEffects: string[] = [];
  expect(report(root, manifest, repeatEffects)).toBe(html);
  expect(repeatEffects).toEqual([]);
}));

test("line diffs retain both versions when edits share a line, add lines, and join the final line", async () => {
  let html = "";
  fixture((root, put) => {
    const manifest: Manifest = { upstream, files: [
      { source: "source.md", output: "delivered.md", kind: "text", mapping: "edits.json" },
    ] };
    put("upstream/source.md", "alpha beta\nkeep\nlast");
    put("mappings/edits.json", JSON.stringify([
      { name: "first", reason: "Change the first word", anchor: "alpha", replace: "X" },
      { name: "second", reason: "Split the first line", anchor: "beta", replace: "Y\nZ" },
      { name: "join", reason: "Join the final lines", anchor: "keep\n", replace: "join-" },
    ]));
    html = report(root, manifest);
  });
  const rows: { numbers: string[]; text: string }[] = [];
  const parsed = new HTMLRewriter()
    .on(".unified .row", { element() { rows.push({ numbers: [], text: "" }); } })
    .on(".unified .row > .ln", {
      element() { rows[rows.length - 1].numbers.push(""); },
      text(chunk) { const row = rows[rows.length - 1]; row.numbers[row.numbers.length - 1] += chunk.text; },
    })
    .on(".unified .row > code", { text(chunk) { rows[rows.length - 1].text += chunk.text; } })
    .transform(new Response(html));
  await parsed.text();
  const before = rows.filter(row => row.numbers[0]);
  const after = rows.filter(row => row.numbers[1]);
  expect(before.map(row => row.numbers[0])).toEqual(["1", "2", "3"]);
  expect(after.map(row => row.numbers[1])).toEqual(["1", "2", "3"]);
  expect(before.map(row => row.text)).toEqual(["alpha beta", "keep", "last · No newline at end of file"]);
  expect(after.map(row => row.text)).toEqual(["X Y", "Z", "join-last · No newline at end of file"]);
});

// Re-reading the expected buffer instead of the delivered bytes misses same-size binary drift.
test("the report separates missing output and byte drift from unchanged sources and local runtime", () => fixture((root, put) => {
  const manifest: Manifest = { upstream, files: [
    { source: "same.txt", output: "same.txt", kind: "text" },
    { source: "stamp.bin", output: "stamp.bin", kind: "binary" },
    { source: "runtime.ts", output: "runtime.ts", kind: "text", origin: "runtime" },
  ] };
  put("upstream/same.txt", "same text\r\n");
  put("upstream/stamp.bin", Uint8Array.of(0, 255));
  put("runtime/runtime.ts", "local runtime\n");
  put("generated/same.txt", "same text\n");
  put("generated/stamp.bin", Uint8Array.of(0, 254));

  const html = report(root, manifest);
  expect(html).toMatch(/id="file-1"[\s\S]*Unchanged text[\s\S]*Matches expected bytes/);
  expect(html).toMatch(/id="file-2"[\s\S]*Binary copy[\s\S]*Byte drift[\s\S]*Expected SHA-256[\s\S]*Observed SHA-256/);
  expect(html).toMatch(/id="file-3"[\s\S]*Local runtime[\s\S]*runtime\/runtime\.ts[\s\S]*Missing output/);
  expect(html).not.toContain("upstream/runtime.ts");
  expect(html).toContain("Static snapshot");
}));

// The report opens locally, so source text and provenance must never become executable markup.
test("the report escapes source, operation and provenance data and does not link unsafe schemes", () => fixture((root, put) => {
  const manifest: Manifest = {
    upstream: { ...upstream, repository: "javascript:alert(1)", version: '<svg onload="bad()">&' },
    files: [{ source: "a&b.txt", output: "c&d.txt", kind: "text", mapping: "unsafe.json" }],
  };
  put("upstream/a&b.txt", "Prefix </script> suffix");
  put("mappings/unsafe.json", JSON.stringify([{
    name: "escape-test",
    reason: "'quoted' & <b>reason</b>",
    anchor: "Prefix </script> suffix",
    find: "</script>",
    replace: '<img src=x onerror="bad()">',
  }]));

  const html = report(root, manifest);
  expect(html).toContain("javascript:alert(1)");
  expect(html).not.toMatch(/href\s*=\s*"javascript:/i);
  expect(html).toContain("&lt;svg onload=&quot;bad()&quot;&gt;&amp;");
  expect(html).toContain("a&amp;b.txt");
  expect(html).toContain("c&amp;d.txt");
  expect(html).toContain("Prefix &lt;/script&gt; suffix");
  expect(html).toContain("&#39;quoted&#39; &amp; &lt;b&gt;reason&lt;/b&gt;");
  expect(html).toContain("&lt;img src=x onerror=&quot;bad()&quot;&gt;");
  expect(html).not.toMatch(/<(img|svg|b)\s*(?:src=|onload=|>)/i);
}));
