# Comfy_Node_UI

`Comfy_Node_UI` is a frontend extension and authoring toolkit for adding a
custom UI to native ComfyUI nodes and subgraphs. The workflow remains an
ordinary ComfyUI workflow with its normal nodes, connections, inputs, outputs,
execution, and saved JSON.

```text
Node  — standard ComfyUI node or subgraph presentation
App   — custom renderer bound to the same workflow values
```

The selected node gets one `Node ↔ App` command in ComfyUI's Selection
Toolbox. ComfyUI's own Run control remains the execution path. Changes made in
the custom UI update the workflow, and workflow or agent edits can be reflected
back into the custom UI.

## What the toolkit provides

- a renderer registry keyed by `node.properties.app_view_renderer`;
- a persistent Node/App presentation switch outside the node body;
- access to the host node, `host.subgraph`, the Comfy app, and API;
- mounting, resizing, synchronization, visibility, and disposal hooks;
- compatibility handling for Node 2.0 and the legacy canvas renderer;
- a repo-local authoring skill for coding agents.

The framework defines no execution nodes and does not replace ComfyUI state.
Each renderer chooses which workflow values to show and may use the full nested
workflow without promoting every field to an external subgraph input.

## Create a renderer

Add a module under `custom_nodes/ComfyUI-AppView/web/renderers` and register it:

```js
import { registerAppViewRenderer } from "../app-view-core.js";

registerAppViewRenderer({
  id: "my-ui@1",
  width: 480,
  height: 600,
  build({ host, app, api }) {
    const root = document.createElement("div");

    // Bind controls to host widgets or nodes inside host.subgraph.

    return {
      root,
      sync() {},
      dispose() {},
    };
  },
});
```

Set the host node property `app_view_renderer` to the same renderer ID. Keep
meaningful values in widgets or graph nodes; use renderer-local state only for
temporary UI details such as hover, open panels, and drag state.

The full format and lifecycle are documented in
`.agents/skills/comfy-app-view-authoring/references/app-view-format.md`.

## Install in ComfyUI Desktop

1. Copy `custom_nodes/ComfyUI-AppView` into the active ComfyUI installation's
   `custom_nodes` directory.
2. Restart ComfyUI Desktop.
3. Import a workflow that names a registered renderer, or add your own renderer
   and binding.
4. Select its host node and use `Node ↔ App` in the Selection Toolbox.

## Included examples

The repository includes two renderer examples:

- `minimax-h3-i2v@1` demonstrates a compact UI over a standard image-to-video
  subgraph;
- `reshoot@1` demonstrates reuse of an existing interactive camera widget.

`workflows/reshoot-app-view.json`, `custom_nodes/ComfyUI-CrossViewWarp`, and
`MODEL_DOWNLOADS.md` belong to the Re-shoot example. They demonstrate the
toolkit and are not requirements for creating other node UIs.

## Agent authoring

Coding agents can discover the authoring skill under `.agents/skills`. The
official Comfy MCP can continue to inspect, edit, validate, and execute the same
workflow because the custom UI is only another presentation of it.

## Validation

Run:

```powershell
node tools/validate-package.mjs
```
