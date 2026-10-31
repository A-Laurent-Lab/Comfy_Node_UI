import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { createAppViewExtension, listAppViewPackages } from "./app-view-core.js";

const extension = createAppViewExtension({ app, api });
const MODE_COMMAND = "Comfy.AppView.ToggleMode";
const LAYOUT_COMMAND = "Comfy.AppView.TogglePanels";

function updateLayoutIcon() {
  const host = selectedAppViewHost();
  for (const icon of document.querySelectorAll('.comfy-app-view-layout-command')) {
    const expanded = host?.properties?.app_view_layout === 'expanded';
    icon.dataset.expanded = String(expanded);
    const button = icon.closest('button');
    button?.setAttribute('aria-pressed', String(expanded));
    button?.setAttribute('aria-label', expanded ? 'App: two panels (collapse)' : 'App: one panel (expand)');
    if (button) button.title = expanded ? 'App: two panels (collapse)' : 'App: one panel (expand)';
  }
}

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

function showUIFiles() {
  const root = document.createElement("section");
  root.dataset.appViewFiles = "1";
  root.style.cssText = "max-width:min(620px,80vw);text-align:left;overflow-wrap:anywhere;color:var(--fg-color,#ddd);font:14px/1.5 system-ui,sans-serif";
  const title = document.createElement("h2");
  title.textContent = "UI files for this workflow";
  const help = document.createElement("p");
  help.textContent = "Share the saved workflow JSON and the whole folders listed below. Copy each folder to the same location in the recipient's ComfyUI.";
  root.append(title, help);
  for (const entry of listAppViewPackages(app.graph)) {
    const section = document.createElement("div");
    section.style.cssText = "margin:16px 0";
    const name = document.createElement("strong");
    name.textContent = `${entry.name}${entry.installed ? "" : " — not installed"}`;
    const hosts = document.createElement("p");
    hosts.textContent = `Used by: ${entry.subgraphs.join(", ")}`;
    const location = document.createElement("code");
    location.textContent = entry.folder
      ? `ComfyUI/custom_nodes/ComfyUI-AppView/web/renderers/${entry.folder}/`
      : "Folder not recorded. Ask the workflow author for its UI folder.";
    section.append(name, hosts, location);
    root.append(section);
  }
  // Comfy's legacy dialog styles paragraphs as errors by default.
  for (const paragraph of root.querySelectorAll("p")) {
    paragraph.style.cssText = "color:inherit;font:inherit";
  }
  app.ui.dialog.show(root);
}

document.documentElement.dataset.comfyAppViewExtension = "loaded";
globalThis.__comfyAppViewExtension = extension;

app.registerExtension({
  name: "comfy.nativeAppView",

  commands: [
    {
      id: LAYOUT_COMMAND,
      label: 'Toggle one / two App panels',
      icon: 'comfy-app-view-layout-command',
      mutatesGraph: true,
      function: () => {
        const host = selectedAppViewHost();
        if (host) extension.toggleLayout(host);
        updateLayoutIcon();
      },
    },
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
      ? [MODE_COMMAND, LAYOUT_COMMAND]
      : [];
  },

  getNodeMenuItems(node) {
    return extension.isAppViewHost(node)
      ? [{ content: "UI files…", callback: showUIFiles }]
      : [];
  },

  async afterConfigureGraph() {
    // Promoted subgraph widgets are resolved by ComfyUI's graph-configured
    // pipeline. Mount on the following frame so both Node 2.0 and the legacy
    // renderer expose the same completed native surface to the App renderer.
    requestAnimationFrame(() => extension.attachAll());
  },

  async setup() {
    // Selection Toolbox reuses its DOM when selection changes.
    const toolbarObserver = new MutationObserver(updateLayoutIcon);
    toolbarObserver.observe(document.body, {childList:true, subtree:true});
    document.addEventListener('comfy-app-view:layout-changed', updateLayoutIcon);
    document.addEventListener("comfy-app-view:renderer-registered", () => {
      requestAnimationFrame(() => extension.attachAll());
    });
    app.canvas.canvas.addEventListener("subgraph-converted", (event) => {
      extension.attach(event.detail?.subgraphNode);
    });
    app.canvas.canvas.addEventListener("litegraph:set-graph", () => {
      // Return borrowed native widgets before the next graph's UI mounts.
      // Presentation mode is saved on the host and is not visibility.
      extension.refreshVisibility();
      requestAnimationFrame(() => {
        extension.attachAll();
        extension.refreshVisibility();
      });
    });
  },
});
