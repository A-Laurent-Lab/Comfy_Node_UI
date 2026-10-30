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
JSON and a separate, named folder for each UI.

You can edit or duplicate the workflow and keep using the same installed UI.
Changing other parts of the workflow does not require a copy of the UI. If you
change the nodes or settings its controls use, ask the agent to adjust the binding.

## Share UI

Right-click a subgraph with a custom UI and select **UI files…**. The window
lists the UI folders used by the current workflow, their locations, and which
subgraphs use them.

Send the saved **workflow JSON and those whole folders**. You do not need to
pick individual `.js` files or copy all of `renderers`. A folder used by several
subgraphs only needs to be sent once. The JSON already records which UI to use.

## Open UI

1. Copy the received **UI folders** into
   `ComfyUI/custom_nodes/ComfyUI-AppView/web/renderers/`.
   For example, the received `comfynodeui-reshoot` folder becomes
   `ComfyUI/custom_nodes/ComfyUI-AppView/web/renderers/comfynodeui-reshoot/`.
   Keep each folder intact: files with the same name stay in their own UI folders.
2. Restart ComfyUI. Skip these two steps if the required UIs are already installed.
3. Open the received JSON, select a subgraph, and choose **App** in
   **Node ↔ App** above the node.

**Importing JSON does not install UI files.**
An existing UI folder only needs replacing when you intend to update that UI.
If a different UI arrives with the same folder name, rename the incoming folder
before copying it. Keep its contents together; the workflow's UI selection is preserved.

## Example

[Re-shoot](workflows/reshoot-app-view.json) is an optional example; its UI is
already included in the `comfynodeui-reshoot` folder. It also needs the supplied
`ComfyUI-CrossViewWarp` folder copied into ComfyUI's `custom_nodes`. Model
download links are in the workflow.
