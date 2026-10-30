# Comfy_Node_UI

Custom interfaces for ComfyUI subgraphs. Select a subgraph and use **Node ↔ App**
to switch between its standard controls and custom UI. Both edit the same
workflow; its nodes remain accessible and editable.

## Install

Copy `custom_nodes/ComfyUI-AppView` from this repository into your ComfyUI
installation's `custom_nodes` folder. Restart ComfyUI.

## Open and share a UI

Open the workflow JSON in ComfyUI, select its subgraph, and switch to **App**.

**JSON does not contain the UI code.** Additional UI files (`.js` and their
assets) go into the installed extension's folder:

```text
ComfyUI/custom_nodes/ComfyUI-AppView/web/renderers/
```

To share your interface, send **the workflow JSON and those UI files**.
The recipient copies the UI files into that folder, preserving any subfolders,
and restarts ComfyUI. If the UI is already installed, only the JSON is needed.

## Create your own UI

Give a coding agent your workflow and the
[comfy-app-view-authoring skill](.agents/skills/comfy-app-view-authoring/SKILL.md).
It creates or edits the UI files and connects them to the workflow.

## Example

[Re-shoot](workflows/reshoot-app-view.json) is an optional example; its UI is
already included. It also needs the supplied `ComfyUI-CrossViewWarp` folder
copied into ComfyUI's `custom_nodes`. Model download links are in the workflow.
