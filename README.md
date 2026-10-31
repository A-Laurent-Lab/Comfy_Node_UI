# Comfy_Node_UI

`ComfyUI-AppView` is a generic extension for custom interfaces on native
ComfyUI subgraphs. Select a subgraph and use **Node ↔ App** to switch between
its normal node controls and an installed custom UI. Both edit the same workflow.
The adjacent panel icon expands the App's right-hand workspace. Essential
controls stay on the left; section buttons select previews, editing or results.
Resizing keeps the selected layout and stops before its panels no longer fit.

Workflow-specific UIs are separate folders. They are not part of the extension.

## Install

Copy `custom_nodes/ComfyUI-AppView` into your ComfyUI `custom_nodes` folder and
restart ComfyUI.

## Create your own UI

Give a coding agent your workflow and the
[comfy-app-view-authoring skill](.agents/skills/comfy-app-view-authoring/SKILL.md).
It returns the prepared workflow JSON and one named UI folder for each custom
subgraph interface.

The same installed UI can be reused by compatible subgraphs in other workflows.

## Share UI

Right-click a custom-UI subgraph and select **UI files…**. Send the saved
workflow JSON and the complete UI folders listed there.

## Open UI

Copy each received UI folder into
`ComfyUI/custom_nodes/ComfyUI-AppView/web/renderers/`, restart ComfyUI, and open
the received JSON. Select its subgraph and choose **App** in **Node ↔ App**.

Importing a workflow JSON does not install its UI folder.

## Optional examples

Installing `ComfyUI-AppView` installs no workflow-specific UI. The examples are
kept separately and can be installed one at a time:

- [MiniMax H3 image-to-video](examples/minimax-h3-i2v/README.md)
- [Re-shoot](examples/reshoot/README.md)
