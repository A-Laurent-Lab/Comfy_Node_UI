import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import "./crossview-widget-compat.js";
import { createAppViewExtension } from "./app-view-core.js";

const extension = createAppViewExtension({ app, api });
const MODE_COMMAND = "Comfy.AppView.ToggleMode";

function selectedItems() {
  const items = app.canvas?.selectedItems;
  if (items) return [...items];
  return Object.values(app.canvas?.selected_nodes ?? {});
}

function selectedAppViewHost() {
  const selected = selectedItems();
  if (selected.length !== 1) return null;
  return extension.isAppViewHost(selected[0]) ? selected[0] : null;
}

document.documentElement.dataset.comfyAppViewExtension = "loaded";
globalThis.__comfyAppViewExtension = extension;

app.registerExtension({
  name: "comfy.nativeAppView",

  commands: [
    {
      id: MODE_COMMAND,
      label: "Toggle Node / App view",
      icon: "comfy-app-view-mode-command",
      mutatesGraph: true,
      function: () => {
        const host = selectedAppViewHost();
        if (host) extension.toggleMode(host);
      },
    },
  ],

  getSelectionToolboxCommands(selectedItem) {
    return selectedItems().length === 1 &&
      extension.isAppViewHost(selectedItem)
      ? [MODE_COMMAND]
      : [];
  },

  async afterConfigureGraph() {
    // Promoted subgraph widgets are resolved by ComfyUI's graph-configured
    // pipeline. Mount on the following frame so both Node 2.0 and the legacy
    // renderer expose the same completed native surface to the App renderer.
    requestAnimationFrame(() => extension.attachAll());
  },

  async setup() {
    document.addEventListener("comfy-app-view:renderer-registered", () => {
      requestAnimationFrame(() => extension.attachAll());
    });
    app.canvas.canvas.addEventListener("subgraph-converted", (event) => {
      extension.attach(event.detail?.subgraphNode);
    });
    app.canvas.canvas.addEventListener("litegraph:set-graph", () => {
      requestAnimationFrame(() => extension.attachAll());
    });
  },
});
