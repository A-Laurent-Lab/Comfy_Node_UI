# Comfy_Node_UI

Give a ComfyUI subgraph its own interface, with a `Node ↔ App` switch above
the selected node. Use the normal node controls, or switch to a custom panel
for the same workflow. Run it with ComfyUI's usual Run button.

```text
Node  — normal subgraph controls and connections
App   — custom interface for the workflow inside that subgraph
```

The current version attaches interfaces to native **subgraph nodes**. A single
ordinary node can be placed inside a subgraph when preparing its custom UI.
Installing this extension alone does not create an interface for every workflow.

## Install the extension once

1. Download this repository with **Code → Download ZIP** and extract it, or
   use an existing local copy.
2. Copy the **`ComfyUI-AppView` folder inside `custom_nodes`** into the
   `custom_nodes` directory of your active ComfyUI installation. The result
   should be `ComfyUI/custom_nodes/ComfyUI-AppView/__init__.py`.
3. Restart ComfyUI.

This is a UI extension installed through ComfyUI's extension package loader.
It does not add an execution node to the node menu. For an update, merge the
package files into the existing `ComfyUI-AppView` folder, keeping any additional
custom interfaces you have added.

## Open a workflow with a custom UI

**Dragging a JSON file into ComfyUI imports the workflow, not its UI code.**

If the interface is already installed, drag the workflow JSON into ComfyUI,
select its subgraph node, and click **Node ↔ App** in the toolbar above it.
For the included Re-shoot example, the interface is already part of
`ComfyUI-AppView`; use the example steps below.

If someone gives you a new custom interface, you also need its UI files. They
should supply a `custom_nodes` folder alongside the JSON. Merge its contents
into your ComfyUI installation's `custom_nodes` folder, keeping the supplied
subfolders, then restart ComfyUI and open the JSON. A JSON import does not
install or download these UI files.

The workflow's computational nodes and models still need to be installed as
usual. If the custom UI is unavailable, the graph remains editable as a normal
subgraph; running it still requires those computational dependencies.

## What is saved and shared?

| Item | In the workflow JSON? | How to share it |
| --- | --- | --- |
| Nodes, connections, subgraphs and parameter values | Yes | Save and send the workflow JSON as usual. |
| Which custom UI to use and the selected Node/App view | Yes | Included when you save the prepared workflow. |
| Custom UI code and its bundled assets | No | Include the extension files under `custom_nodes`, with their directory structure. |
| Input videos/images and model weights | No | Supply input media separately; install the workflow's models as usual. |

Edits in App view change the real workflow parameters. You can enter the
subgraph, edit its nodes, and work with the same workflow through an agent.
The custom panel's controls are chosen when that interface is created; adding
another node to the graph does not automatically add controls to the panel.

When sharing a UI you have created or modified, send **both the saved JSON and
the matching `custom_nodes/ComfyUI-AppView` folder**, including your UI files
and assets. If the recipient already has that exact UI installed, sending only
the updated JSON is enough. The authoring skill is not needed to use the UI.

## Create or change your own UI

Open this repository in a coding agent with access to your workflow JSON.
Ask it to use the included
[comfy-app-view-authoring skill](.agents/skills/comfy-app-view-authoring/SKILL.md).
For example:

> Use comfy-app-view-authoring to create a custom UI for this workflow. Include
> a prompt field, a seed control and an image preview. Return the updated
> workflow JSON and the extension folder I need to copy into ComfyUI.

The agent writes or edits the interface files and connects them to the workflow.
There is no visual UI designer built into the extension. The skill contains the
technical instructions for authors; it does not run inside ComfyUI.

## Optional example: Re-shoot

This example demonstrates an interactive camera interface. Its UI is bundled
with the main extension; its video-processing nodes are a separate dependency.

1. Install `ComfyUI-AppView` as described above. Also copy
   `custom_nodes/ComfyUI-CrossViewWarp` into ComfyUI's `custom_nodes` directory
   if you do not already have the version used by this example. Restart ComfyUI.
2. Drag [workflows/reshoot-app-view.json](workflows/reshoot-app-view.json)
   into ComfyUI.
3. Use the workflow's missing-model download buttons. The model URLs are already
   in the JSON. Choose your source video in the workflow.
4. Select the Re-shoot subgraph, switch to **App**, adjust the camera, and use
   ComfyUI's **Run** button.

CrossView and these models are only needed for this example. A second UI code
example, `minimax-h3-i2v.js`, is included for authors; its matching workflow is
not included in this download.
