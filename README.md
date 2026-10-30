# ComfyUI App View — Re-shoot portable folder

This folder contains the frontend App View extension, its authoring skill, the
native Re-shoot subgraph workflow, and the exact CrossView custom-node source
required by that workflow. It contains no model weights and no installer.

## Contents

- `custom_nodes/ComfyUI-AppView` — Node/App renderer and compatibility layer.
- `custom_nodes/ComfyUI-CrossViewWarp` — clean source snapshot at commit
  `fbb1e93c7193329ff3ce7c17f95166b539687876`.
- `workflows/reshoot-app-view.json` — native subgraph, 14 settings and three
  VIDEO outputs.
- `.agents/skills/comfy-app-view-authoring` — repo-local coding-agent skill.
- `MODEL_DOWNLOADS.md` — model URLs already embedded in the workflow.

## Use in ComfyUI Desktop

1. Copy both directories from `custom_nodes` into the active ComfyUI
   installation's `custom_nodes` directory.
2. Restart ComfyUI Desktop.
3. Import `workflows/reshoot-app-view.json` or copy it into the user's workflow
   directory.
4. Let the workflow problem panel download the listed models. The JSON contains
   their exact URLs and destination categories.
5. Select the Re-shoot subgraph and use `Node ↔ App` in the selection toolbar.

The bundled CrossView source is intentional: this exact dependency is not
currently available as an automatic Manager install. Its requirements file has
no mandatory packages beyond NumPy and PyTorch already provided by ComfyUI.

## Agent authoring

Open this folder as the coding workspace. Codex-compatible agents can discover
the repo-local skill under `.agents/skills`. Official Comfy MCP remains the
workflow inspection, validation, parameterization and execution route; renderer
source changes use ordinary repository tools plus the skill.

## Validation

Run:

```powershell
node tools/validate-package.mjs
```
