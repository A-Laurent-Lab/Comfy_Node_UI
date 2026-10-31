import assert from "node:assert/strict";
import { registerAppViewRenderer, listAppViewPackages } from "../custom_nodes/ComfyUI-App-View/web/app-view-core.js";

// Only registration notifications need a document; no UI rendering is simulated.
globalThis.document = new EventTarget();
const moduleRoot = new URL("../custom_nodes/ComfyUI-App-View/web/renderers/", import.meta.url);
const camera = {
  id: "test-camera@1", name: "Camera", build() {},
  source: new URL("author-camera/index.js", moduleRoot).href,
};
const color = {
  id: "test-color@1", name: "Color", build() {},
  source: new URL("author-color/index.js", moduleRoot).href,
};
registerAppViewRenderer(camera);
registerAppViewRenderer(color);
registerAppViewRenderer(camera); // Re-importing the same registration is harmless.
assert.throws(() => registerAppViewRenderer({
  ...camera, source: new URL("other-camera/index.js", moduleRoot).href,
}), /registration conflicts/);

const host = (title, id, nodes = []) => ({
  title, properties: { app_view_renderer: id }, subgraph: { nodes },
});
const graph = { nodes: [
  host("First camera", camera.id, [host("Color controls", color.id)]),
  host("Second camera", camera.id),
  { properties: { app_view_renderer: "not-a-subgraph" } },
] };
assert.deepEqual(listAppViewPackages(graph), [
  { name: "Camera", folder: "author-camera", installed: true, subgraphs: ["First camera", "Second camera"] },
  { name: "Color", folder: "author-color", installed: true, subgraphs: ["Color controls"] },
]);

const missing = host("Absent UI", "not-installed@1");
missing.properties.app_view_package = { name: "Missing UI", folder: "author-missing" };
assert.deepEqual(listAppViewPackages({ nodes: [missing] }), [
  { name: "Missing UI", folder: "author-missing", installed: false, subgraphs: ["Absent UI"] },
]);
delete missing.properties.app_view_package;
assert.equal(listAppViewPackages({ nodes: [missing] })[0].folder, null);
const renamed = { ...camera, id: "test-renamed@1", source: new URL("renamed-folder/index.js", moduleRoot).href };
registerAppViewRenderer(renamed);
const renamedHost = host("Renamed package", renamed.id);
renamedHost.properties.app_view_package = { name: "Camera", folder: "old-folder" };
assert.equal(listAppViewPackages({ nodes: [renamedHost] })[0].folder, "renamed-folder");
console.log("UI folders: distinct packages, nested hosts, reuse, missing UI hints and registration collision checks passed.");
