import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "custom_nodes/ComfyUI-AppView/__init__.py",
  "custom_nodes/ComfyUI-AppView/web/app-view.js",
  "custom_nodes/ComfyUI-AppView/web/crossview-widget-compat.js",
  "custom_nodes/ComfyUI-AppView/web/renderers/reshoot.js",
  "custom_nodes/ComfyUI-CrossViewWarp/__init__.py",
  "custom_nodes/ComfyUI-CrossViewWarp/crossview_warp_node.py",
  ".agents/skills/comfy-app-view-authoring/SKILL.md",
  "workflows/reshoot-app-view.json",
];
for (const relative of required) assert.ok(await lstat(path.join(root, relative)));

async function inspect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    assert.ok(!entry.isSymbolicLink(), `symlink is not portable: ${relative}`);
    assert.ok(entry.name !== ".git", `git metadata leaked: ${relative}`);
    assert.ok(entry.name !== "__pycache__", `Python cache leaked: ${relative}`);
    assert.ok(!entry.name.endsWith(".pyc"), `Python bytecode leaked: ${relative}`);
    if (entry.isDirectory()) await inspect(path.join(directory, entry.name), relative);
  }
}
await inspect(root);

const manifestLines = (await readFile(path.join(root, "MANIFEST.sha256"), "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
for (const line of manifestLines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `invalid manifest line: ${line}`);
  const data = await readFile(path.join(root, ...match[2].split("/")));
  assert.equal(createHash("sha256").update(data).digest("hex"), match[1]);
}

const workflow = JSON.parse(
  await readFile(path.join(root, "workflows/reshoot-app-view.json"), "utf8"),
);
const host = workflow.nodes.find(
  (node) => node.properties?.app_view_renderer === "reshoot@1",
);
assert.ok(host, "Re-shoot App View host is missing");
assert.equal(host.inputs.length, 14);
assert.equal(host.outputs.length, 3);
const subgraph = workflow.definitions.subgraphs.find((item) => item.id === host.type);
assert.ok(subgraph);
assert.equal(subgraph.nodes.length, 26);
assert.equal(subgraph.links.length, 56);
const modelEntries = subgraph.nodes.flatMap((node) => node.properties?.models ?? []);
assert.equal(modelEntries.length, 7);
assert.ok(modelEntries.every((model) => model.name && model.directory && model.url));

console.log(JSON.stringify({ portable: true, manifestFiles: manifestLines.length,
  renderer: "reshoot@1", inputs: 14, outputs: 3, innerNodes: 26,
  innerLinks: 56, modelDownloads: 7 }, null, 2));
