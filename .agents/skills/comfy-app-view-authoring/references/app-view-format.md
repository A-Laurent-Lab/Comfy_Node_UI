# App View format used in this project

## Files to inspect first

- `custom_nodes/ComfyUI-AppView/web/app-view-core.js` — generic registry,
  Selection Toolbox command, mounting, view switching, and sizing.
- `custom_nodes/ComfyUI-AppView/web/crossview-widget-compat.js` — bounded
  compatibility fix for the reused CrossView DOM canvas sizing.
- `custom_nodes/ComfyUI-AppView/web/renderers/reshoot.js` — renderer that
  addresses inner workflow nodes by stable roles and reuses a custom DOM widget.
- `custom_nodes/ComfyUI-AppView/web/renderers/minimax-h3-i2v.js` — renderer
  that works mostly through promoted host widgets.
- `working/workflows/reshoot-app-view.json` in the source checkout, or
  `workflows/reshoot-app-view.json` in the portable folder — accepted example.
- `tools/build-app-view-workflows.mjs`,
  `tools/verify-app-view-workflows.mjs`, and
  `tools/smoke-app-view.mjs` — repeatable build and verification routes.

## Workflow binding

The host remains an ordinary native `SubgraphNode`. Bind a renderer with:

```json
{
  "properties": {
    "app_view_renderer": "example@1",
    "app_view_mode": "node"
  }
}
```

Use a versioned renderer ID. Keep `node` as the portable default. Renderer
absence must leave the normal subgraph usable.

Stable inner roles belong in the relevant node's ordinary properties when node
IDs are likely to change:

```json
{ "properties": { "example_role": "camera" } }
```

Do not use screen position or translated title text as identity.

## Renderer contract

Create a module under `custom_nodes/ComfyUI-AppView/web/renderers`. ComfyUI loads
the `.js` files in the package's `WEB_DIRECTORY`; each UI module self-registers
with the shared registry. Do not add per-App imports to the generic entrypoint.
For the layout in this repository, registration looks like this:

```js
import { registerAppViewRenderer } from "../app-view-core.js";

registerAppViewRenderer({
  id: "example@1",
  width: 520,
  height: 640,
  build({ host, app, api }) {
    const root = document.createElement("div");
    return {
      root,
      onShow() {},
      onHide() {},
      dispose() {},
    };
  },
});
```

The renderer can inspect `host.subgraph`, the host's promoted widgets, and the
root graph. Keep App-specific selectors, labels, field mapping, and visual code
inside this module.

The generic host owns the `Node ↔ App` command, renderer lookup, DOM widget,
natural-height measurement, and disposal. Do not fork those mechanisms inside a
renderer.

The skeleton above only mounts a panel. Implement controls, canonical-value
bindings and workflow-to-UI updates in the renderer. The host calls `onShow`,
`onHide` and `dispose`; it does not call a `sync` function on every graph edit.
Use the existing renderer patterns for update subscriptions or polling, and
dispose them when the host is removed. The optional dimensions guide sizing;
keep user resizing intact. Renderer IDs and binding selectors must match the
JSON being delivered, not just a workflow open in the author's browser.

## Canonical values

There are two common binding shapes.

### Promoted host widget

Use the host widget directly when it is the canonical parameter:

```js
const prompt = host.widgets.find((widget) => widget.name === "prompt");
prompt.value = next;
prompt.callback?.(next, app.canvas, host);
host.onWidgetChanged?.("prompt", next, previous, prompt);
```

Use the actual installed frontend's widget APIs. Preserve callbacks and notify
the graph so ordinary UI, serialization, and agent edits stay synchronized.

### Inner custom widget plus promoted value

Some rich widgets, such as CrossView's camera editor, live on an inner node.
If the same field is also promoted, changing the inner widget may not update the
host's stored value. Bridge callbacks in both directions and restore wrapped
callbacks in `dispose`. Verify the serialized host value, not only the visible
inner control.

Transient hover, open details, canvas buffers, and animation frames can stay in
the renderer. Do not make them workflow slots.

## Public graph surface

Subgraph inputs and outputs are an author choice:

- expose settings that should remain editable in ordinary Node view;
- expose typed values that other nodes should connect to;
- keep App-only presentation details private;
- allow multiple outputs when the workflow naturally has them.

Re-shoot currently exposes 14 ordinary settings and three `VIDEO` results.
The App renderer still uses other inner preview behavior without publishing it
as a slot.

## Packaging and agent guidance

Distribution is:

```text
workflow JSON
+ custom_nodes/ComfyUI-AppView (extension + matching UI modules/assets)
+ normal custom-node/model dependencies of the workflow
```

The workflow does not embed JavaScript. Users copy the extension folder into
their active ComfyUI installation's `custom_nodes`, restart, and then drag the
JSON into ComfyUI. Reusing an already-installed exact UI needs only the JSON.
If the extension or renderer is missing, the workflow still opens as a native
subgraph; this fallback does not supply missing computational nodes or models.

Shipping a complete updated `ComfyUI-AppView` folder is the existing delivery
route. Include new renderer modules, imports and static assets; instruct users
to merge the files while keeping any additional local UIs. For a separate UI
package, first implement and verify its extension imports and installation
steps instead of assuming a bare JavaScript file is independently installable.

The distribution contains `workflows/reshoot-app-view.json` and the UI code for
both examples. The MiniMax workflow is in the full development checkout only;
do not describe it as a bundled runnable workflow. CrossView and the model
weights are dependencies of the Re-shoot example, not of the generic extension.
Keep download URLs in workflow model metadata rather than duplicating a list
in a separate Markdown file.

For external agents, use clear slot labels and a normal `MarkdownNote` in the
workflow. Official local Comfy MCP can read workflow slots and notes, inspect
installed custom nodes/models, validate, and run. It does not create renderer
source files; the coding agent applies this skill to those files.

## Checks

From the full source checkout:

```powershell
node tools/build-app-view-workflows.mjs
node tools/verify-app-view-workflows.mjs
$env:COMFY_URL='http://127.0.0.1:8188'
node tools/smoke-app-view.mjs
```

From the portable folder, run `node tools/validate-package.mjs`, then operate
the workflow in the real frontend. The portable folder intentionally omits the
source-only workflow builder and its pinned upstream inputs.

Also inspect the resulting screenshots in `.tmp`. Confirm:

- one Selection Toolbox `Node ↔ App` control and no switch in the node body;
- native settings in Node mode and only the renderer surface in App mode;
- no renderer-owned Run or sign-in control;
- App edits survive serialize/reload;
- ordinary Node or agent edits appear in App;
- expanding renderer content grows the node without an inner scrollbar;
- manually narrowing or widening the host preserves that size and reflows the UI;
- borrowed native DOM widgets return to their original node in Node mode;
- real pointer drag works in Node 2.0 and its value survives the state bridge;
- missing renderer degrades to the native subgraph.

For the pinned frontend 1.57.4, verify Node 2.0 and legacy after custom node
definitions are registered. Loading earlier creates placeholder `UNKNOWN`
widgets and is a test/setup race, not a reason to add a second state system.

## Official references

- <https://docs.comfy.org/custom-nodes/js/javascript_hooks>
- <https://docs.comfy.org/custom-nodes/js/subgraphs>
- <https://docs.comfy.org/agent-tools/mcp>
- <https://docs.comfy.org/agent-tools/in-app-agent>
