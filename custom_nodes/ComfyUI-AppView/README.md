# Native App View extension for ComfyUI subgraphs

This frontend-only package gives selected native \`SubgraphNode\` instances two
presentations of the same workflow:

\`\`\`text
Node  — normal promoted settings, slots, outputs, and Edit Subgraph
App   — renderer-specific UI over the same workflow values
\`\`\`

Select the host node and use the single \`Node ↔ App\` command in ComfyUI's
Selection Toolbox. The switch is not stored as a widget and does not occupy the
node body.

The general layer owns only:

- renderer lookup through \`node.properties.app_view_renderer\`;
- the Selection Toolbox command and persisted \`app_view_mode\`;
- mounting, natural-height sizing, visibility switching, and disposal.

Renderer modules self-register through \`registerAppViewRenderer\`. The generic
entrypoint does not name Re-shoot or MiniMax.

A renderer receives the complete host, \`host.subgraph\`, and root graph. The
public subgraph inputs/outputs remain an independently chosen composition and
Node surface. App fields do not have to become slots, while promoted fields must
stay synchronized with the renderer when both expose the same value.

Included renderers:

- \`reshoot@1\` — adapts the official Re-shoot UI, reuses the actual CrossView
  orbit/preview widget, and bridges its inner camera values to 14 promoted host
  settings;
- \`minimax-h3-i2v@1\` — a second consumer on the standard ComfyUI
  \`Image to Video (MiniMax H3)\` template.

The package defines no Python execution nodes. \`__init__.py\` only exposes
\`WEB_DIRECTORY\`. ComfyUI's own Run control remains the execution path.

\`crossview-widget-compat.js\` constrains the existing CrossView orbit/preview
DOM widgets to the height intended by their node pack. It also handles orbit
pointer movement on the canvas because Node 2.0's WidgetDOM stops the
document-level pointermove listener used by CrossView. This prevents both the
\`height: 100%\` growth loop and the stationary orbit in native and App views.

Corresponding workflow files are under `working/workflows` in the full source
checkout. The portable Re-shoot folder contains `workflows/reshoot-app-view.json`;
the separate MiniMax example remains in the full source checkout.

If the extension is absent, both workflows still open as ordinary native
subgraphs. Node 2.0 and the legacy renderer are both checked. The extension
preserves user resizing, mounts borrowed rich widgets only while App mode is
visible, and restores them to their native inner node in Node mode.

The repo-local authoring skill is
`.agents/skills/comfy-app-view-authoring/SKILL.md`.
