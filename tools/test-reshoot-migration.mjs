import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { repairLegacyReshootWorkflow } from "../custom_nodes/ComfyUI-AppView/web/renderers/comfynodeui-reshoot/workflow.js";

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error("Pass an old reshoot-app-view.json to check its migration");
const original = JSON.parse(await readFile(fixturePath, "utf8"));
const candidate = structuredClone(original);
const host = candidate.nodes.find((node) => node.properties?.app_view_renderer === "reshoot@1");
assert.ok(host?.inputs.some((input) => input.name === "file"), "Expected the released legacy example");
host.widgets_values_named.file = "selected-video.mp4";
host.widgets_values[0] = "selected-video.mp4";
const settings = structuredClone(host.widgets_values_named);
assert.equal(repairLegacyReshootWorkflow(candidate), 2);
const definition = candidate.definitions.subgraphs.find((graph) => graph.id === host.type);
const source = definition.nodes.find((node) => node.properties?.reshoot_role === "source-video");
const prepare = definition.nodes.find((node) => node.properties?.reshoot_role === "prepare");
const prompt = definition.nodes.find((node) => node.properties?.reshoot_role === "prompt");
assert.equal(source.widgets_values_named.file, "selected-video.mp4");
assert.equal(source.inputs.find((input) => input.name === "file").link, null);
delete settings.file;
assert.deepEqual(host.widgets_values_named, settings, "Unrelated host settings must survive");
for (const name of ["width", "height", "length"]) {
  const input = prompt.inputs.find((slot) => slot.name === name);
  const link = definition.links.find((item) => item.id === input.link);
  assert.equal(prepare.outputs[link.origin_slot].name, name);
  assert.equal(prompt.inputs[link.target_slot].name, name);
}
assert.equal(prompt.inputs.find((input) => input.name === "ref_image_size").link, null);
const once = JSON.stringify(candidate);
assert.equal(repairLegacyReshootWorkflow(candidate), 0);
assert.equal(JSON.stringify(candidate), once, "Migration must be idempotent");

const wired = structuredClone(original);
const wiredHost = wired.nodes.find((node) => node.properties?.app_view_renderer === "reshoot@1");
wiredHost.inputs.find((input) => input.name === "file").link = 900;
repairLegacyReshootWorkflow(wired);
assert.equal(wiredHost.inputs.find((input) => input.name === "file").link, 900);

const foreign = structuredClone(original);
foreign.nodes.find((node) => node.properties?.app_view_renderer === "reshoot@1").properties.app_view_renderer = "different-ui@1";
const beforeForeign = JSON.stringify(foreign);
assert.equal(repairLegacyReshootWorkflow(foreign), 0);
assert.equal(JSON.stringify(foreign), beforeForeign);
console.log("Legacy Re-shoot migration preserves selections/settings, repairs named connections, is idempotent, and leaves foreign or deliberately wired media inputs alone.");
