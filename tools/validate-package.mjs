import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "custom_nodes/ComfyUI-AppView/__init__.py",
  "custom_nodes/ComfyUI-AppView/web/app-view-core.js",
  "custom_nodes/ComfyUI-AppView/web/app-view.js",
  "custom_nodes/ComfyUI-AppView/web/renderers/README.md",
  ".agents/skills/comfy-app-view-authoring/SKILL.md",
  "examples/minimax-h3-i2v/minimax-h3-i2v-app-view.json",
  "examples/minimax-h3-i2v/ui/comfynodeui-minimax-h3-i2v/index.js",
  "examples/reshoot/reshoot-app-view.json",
  "examples/reshoot/ui/comfynodeui-reshoot/index.js",
  "examples/reshoot/ui/comfynodeui-reshoot/workflow.js",
  "examples/reshoot/ui/comfynodeui-reshoot/crossview-widget-compat.js",
  "examples/reshoot/nodes/ComfyUI-CrossViewWarp/__init__.py",
  "examples/reshoot/nodes/ComfyUI-CrossViewWarp/crossview_warp_node.py",
];
for (const relative of required) assert.ok(await lstat(path.join(root, relative)));

const packagedFiles = [];
async function inspect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!prefix && entry.name === ".git") continue;
    const relative = path.posix.join(prefix, entry.name);
    assert.ok(!entry.isSymbolicLink(), `symlink is not portable: ${relative}`);
    assert.ok(entry.name !== ".git", `nested git metadata leaked: ${relative}`);
    assert.ok(entry.name !== "__pycache__", `Python cache leaked: ${relative}`);
    assert.ok(!entry.name.endsWith(".pyc"), `Python bytecode leaked: ${relative}`);
    if (entry.isDirectory()) await inspect(path.join(directory, entry.name), relative);
    else if (relative !== "MANIFEST.sha256") packagedFiles.push(relative);
  }
}
await inspect(root);

const frameworkSource = await readFile(
  path.join(root, "custom_nodes/ComfyUI-AppView/web/app-view-core.js"),
  "utf8",
);
assert.match(frameworkSource, /export function registerAppViewRenderer\(/);
const entrySource = await readFile(
  path.join(root, "custom_nodes/ComfyUI-AppView/web/app-view.js"),
  "utf8",
);
assert.doesNotMatch(entrySource, /CrossView|reshoot|minimax/i);
assert.deepEqual(
  (await readdir(path.join(root, "custom_nodes/ComfyUI-AppView/web/renderers"))).sort(),
  ["README.md"],
  "The generic extension must not install workflow-specific renderers",
);

const rendererSources = await Promise.all([
  readFile(
    path.join(root, "examples/minimax-h3-i2v/ui/comfynodeui-minimax-h3-i2v/index.js"),
    "utf8",
  ),
  readFile(
    path.join(root, "examples/reshoot/ui/comfynodeui-reshoot/index.js"),
    "utf8",
  ),
]);
assert.match(rendererSources[0], /id:\s*RENDERER/);
assert.match(rendererSources[1], /id:\s*RENDERER/);
assert.match(rendererSources[1], /crossview-widget-compat\.js/);

const manifestLines = (await readFile(path.join(root, "MANIFEST.sha256"), "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const manifestPaths = [];
for (const line of manifestLines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `invalid manifest line: ${line}`);
  manifestPaths.push(match[2]);
  const data = await readFile(path.join(root, ...match[2].split("/")));
  assert.equal(createHash("sha256").update(data).digest("hex"), match[1]);
}
assert.deepEqual(manifestPaths.sort(), packagedFiles.sort(), "Manifest must cover the package exactly");

const workflow = JSON.parse(
  await readFile(path.join(root, "examples/reshoot/reshoot-app-view.json"), "utf8"),
);
const host = workflow.nodes.find(
  (node) => node.properties?.app_view_renderer === "reshoot@1",
);
assert.ok(host, "Re-shoot App View host is missing");
assert.equal(host.properties.app_view_package?.folder, "comfynodeui-reshoot");
assert.equal(host.inputs.length, 13);
assert.equal(host.outputs.length, 3);
const subgraph = workflow.definitions.subgraphs.find((item) => item.id === host.type);
assert.ok(subgraph);
assert.equal(subgraph.nodes.length, 26);
assert.equal(subgraph.links.length, 55);
for (const link of subgraph.links) {
  const from = link.origin_id === -10 ? subgraph.inputs[link.origin_slot]
    : subgraph.nodes.find((node) => node.id === link.origin_id)?.outputs?.[link.origin_slot];
  const to = link.target_id === -20 ? subgraph.outputs[link.target_slot]
    : subgraph.nodes.find((node) => node.id === link.target_id)?.inputs?.[link.target_slot];
  assert.ok(from && to, `Dangling link ${link.id}`);
  assert.ok(from.type === to.type || from.type === "*" || to.type === "*",
    `Link ${link.id}: ${from.name} (${from.type}) -> ${to.name} (${to.type})`);
}
const prepare = subgraph.nodes.find((node) => node.properties?.reshoot_role === "prepare");
const prompt = subgraph.nodes.find((node) => node.properties?.reshoot_role === "prompt");
const source = subgraph.nodes.find((node) => node.properties?.reshoot_role === "source-video");
assert.equal(source.inputs.find((input) => input.name === "file").link, null);
for (const name of ["width", "height", "length"]) {
  const input = prompt.inputs.find((slot) => slot.name === name);
  const link = subgraph.links.find((candidate) => candidate.id === input.link);
  assert.equal(link.origin_id, prepare.id);
  assert.equal(prepare.outputs[link.origin_slot].name, name);
  assert.equal(prompt.inputs[link.target_slot].name, name);
}
assert.equal(prompt.inputs.find((input) => input.name === "ref_image_size").link, null);
const modelEntries = subgraph.nodes.flatMap((node) => node.properties?.models ?? []);
assert.equal(modelEntries.length, 7);
assert.ok(modelEntries.every((model) => model.name && model.directory && model.url));

const minimaxWorkflow = JSON.parse(
  await readFile(
    path.join(root, "examples/minimax-h3-i2v/minimax-h3-i2v-app-view.json"),
    "utf8",
  ),
);
const minimaxHost = minimaxWorkflow.nodes.find(
  (node) => node.properties?.app_view_renderer === "minimax-h3-i2v@1",
);
assert.ok(minimaxHost, "MiniMax App View host is missing");
assert.equal(
  minimaxHost.properties.app_view_package?.folder,
  "comfynodeui-minimax-h3-i2v",
);

console.log(JSON.stringify({
  portable: true,
  framework: "Comfy_Node_UI",
  coreRenderers: 0,
  manifestFiles: manifestLines.length,
  optionalExamples: ["minimax-h3-i2v", "reshoot"],
  reshootExample: {
    inputs: 13,
    outputs: 3,
    innerNodes: 26,
    innerLinks: 55,
    modelDownloads: 7,
  },
}, null, 2));
