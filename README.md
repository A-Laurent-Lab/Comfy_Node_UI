# Comfy_Node_UI

Custom interfaces for ComfyUI subgraphs. Select a subgraph and use **Node ↔ App**
to switch between its standard controls and custom UI. Both edit the same
workflow; its nodes remain accessible and editable.

## Install

Copy `custom_nodes/ComfyUI-AppView` from this repository into your ComfyUI
installation's `custom_nodes` folder. Restart ComfyUI.

## Create your own UI

Give a coding agent your workflow and the
[comfy-app-view-authoring skill](.agents/skills/comfy-app-view-authoring/SKILL.md).
It creates the UI, binds it to the chosen subgraph, and returns the prepared
JSON plus the exact list of UI files to share.

## Share UI

Each subgraph stores its UI's ID in `properties.app_view_renderer`. The
extension matches that ID to the one registered by a UI's `.js` file.
The JSON filename does not select the UI. For example:

```text
film.json → Camera subgraph → studio.camera@1 → studio-camera.js
film.json → Color subgraph  → studio.color@1  → studio-color.js
clip.json → Camera subgraph → studio.camera@1 → studio-camera.js (reused)
```

Send the JSON and **only the files for the UI IDs it uses**, including their
helper files and assets. The authoring agent provides this file list; the
`renderers` directory may also contain unrelated UIs. Several subgraphs can
reuse one installed UI, each with its own workflow values.

## Open UI

1. Copy the received UI files into
   `ComfyUI/custom_nodes/ComfyUI-AppView/web/renderers/`.
   In the example above, `studio-camera.js` goes directly into that directory,
   alongside `studio-color.js`. Keep any accompanying asset folders beside
   their files, with the supplied relative paths.
2. Restart ComfyUI. Skip these two steps if those UIs are already installed.
3. Open the received JSON, select a subgraph, and choose **App** in
   **Node ↔ App** above the node.

**Importing JSON does not install UI files.**

## Example

[Re-shoot](workflows/reshoot-app-view.json) is an optional example; its UI is
already included. Its subgraph uses `reshoot@1`, registered by
`web/renderers/reshoot.js`. It also needs the supplied `ComfyUI-CrossViewWarp`
folder copied into ComfyUI's `custom_nodes`. Model download links are in the workflow.
