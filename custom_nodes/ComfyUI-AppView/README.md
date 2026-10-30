# Comfy_Node_UI frontend extension

This frontend-only extension lets a native ComfyUI node or `SubgraphNode` use
two presentations of the same workflow:

```text
Node  — normal widgets, slots, outputs, and Edit Subgraph
App   — renderer-specific UI over the same workflow values
```

Select the host node and use the `Node ↔ App` command in ComfyUI's Selection
Toolbox. The switch is stored as presentation metadata, does not occupy the node
body, and does not change how the workflow executes.

## General layer

The framework owns only:

- renderer lookup through `node.properties.app_view_renderer`;
- the Selection Toolbox command and persisted `app_view_mode`;
- renderer mounting, natural-height sizing, synchronization, visibility, and
  disposal;
- Node 2.0 and legacy-canvas compatibility.

Renderer modules register through `registerAppViewRenderer`. A renderer receives
the complete host node, the Comfy app, and API; the nested workflow remains
available through `host.subgraph`.

The public subgraph inputs and outputs remain an independently chosen
composition surface. App fields do not have to become slots. When App and Node
views expose the same value, both bind to the same canonical widget or inner
node value so user and agent edits stay synchronized.

The extension defines no Python execution nodes. `__init__.py` only exposes
`WEB_DIRECTORY`, and ComfyUI's own Run control remains the execution path.

## Renderer contract

A renderer provides an ID and `build({ host, app, api })`. Its build result must
contain `root` and may provide `sync`, `onShow`, and `dispose` hooks. Optional
renderer dimensions guide initial sizing while user resizing remains preserved.

See `.agents/skills/comfy-app-view-authoring/SKILL.md` and its
`references/app-view-format.md` for the authoring workflow and binding rules.

## Included examples

- `minimax-h3-i2v@1` demonstrates a compact UI for a standard MiniMax H3
  image-to-video subgraph.
- `reshoot@1` demonstrates a richer renderer that borrows the existing
  CrossView orbit and preview widget.

The examples are consumers of the general framework. Other renderers do not
depend on Re-shoot, CrossView, or their models.

## DOM widget compatibility

`crossview-widget-compat.js` constrains borrowed CrossView orbit and preview DOM
widgets to the height intended by their node pack. It also bridges orbit pointer
movement on the canvas because Node 2.0's `WidgetDOM` stops the document-level
pointer listener used by CrossView. This prevents both the `height: 100%` growth
loop and a stationary orbit in native and App views.

If the extension is absent, workflows still open as ordinary native subgraphs.
