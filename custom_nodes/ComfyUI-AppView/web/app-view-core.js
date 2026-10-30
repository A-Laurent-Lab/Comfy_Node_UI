const NODE_WIDTH = 300;
const PANEL_MARGIN = 4;
const rendererRegistry =
  globalThis.__comfyAppViewRendererRegistry ?? new Map();
globalThis.__comfyAppViewRendererRegistry = rendererRegistry;

export function registerAppViewRenderer(renderer) {
  if (!renderer?.id || typeof renderer.build !== "function") {
    throw new TypeError("App View renderer requires an id and build function");
  }
  const existing = rendererRegistry.get(renderer.id);
  if (existing === renderer) return;
  if (existing) {
    throw new Error(
      `Cannot load UI "${renderer.name ?? renderer.id}" from ${renderer.source ?? "an unknown file"}: ` +
      `its registration conflicts with ${existing.source ?? existing.id}. ` +
      "The installed UI was kept. Ask the UI author to give the new UI a distinct registration.",
    );
  }
  rendererRegistry.set(renderer.id, renderer);
  document.dispatchEvent(
    new CustomEvent("comfy-app-view:renderer-registered", {
      detail: { id: renderer.id },
    }),
  );
}

function rendererPackage(renderer) {
  if (!renderer?.source) return null;
  const root = new URL("./renderers/", import.meta.url).href;
  const source = new URL(renderer.source).href;
  if (!source.startsWith(root)) return null;
  const parts = source.slice(root.length).split("/");
  if (parts.length < 2) return null; // Legacy flat modules have no shareable folder.
  return { folder: decodeURIComponent(parts[0]), name: renderer.name ?? parts[0] };
}

export function listAppViewPackages(graph) {
  const packages = new Map();
  walkGraph(graph, (node) => {
    const id = node.properties?.app_view_renderer;
    if (!node.subgraph || !id) return;
    const renderer = rendererRegistry.get(id);
    // Saved metadata explains what to install even when this UI is absent.
    const info = rendererPackage(renderer) ?? node.properties.app_view_package;
    const key = info?.folder ?? id;
    if (!packages.has(key)) {
      packages.set(key, {
        name: info?.name ?? node.title ?? "Custom UI",
        folder: info?.folder ?? null,
        installed: Boolean(renderer),
        subgraphs: [],
      });
    }
    const entry = packages.get(key);
    entry.installed &&= Boolean(renderer);
    entry.subgraphs.push(node.title ?? "Subgraph");
  });
  return [...packages.values()];
}

function addStyles() {
  if (document.getElementById("comfy-app-view-styles")) return;
  const style = document.createElement("style");
  style.id = "comfy-app-view-styles";
  style.textContent = `
    .comfy-app-view-mode-command {
      display: inline-flex;
      align-items: center;
      width: auto;
      min-width: max-content;
      font-style: normal;
    }
    .comfy-app-view-mode-command::after {
      content: "Node ↔ App";
      color: currentColor;
      font: 11px/1 system-ui, sans-serif;
      white-space: nowrap;
    }
    .lg-node:has(.comfy-app-view-active)
      .lg-node-widgets
      [data-widget-name]:not([data-widget-name="app_view_panel"]) {
      display: none !important;
    }
    .comfy-app-view-error {
      padding: 12px;
      border: 1px solid #71443f;
      border-radius: 8px;
      background: #2c1b1a;
      color: #ffbbb3;
      font: 12px system-ui, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

function walkGraph(graph, callback) {
  for (const node of graph?.nodes ?? []) {
    callback(node, graph);
    if (node.subgraph) walkGraph(node.subgraph, callback);
  }
}

function buildError(error) {
  const root = document.createElement("div");
  root.className = "comfy-app-view-error";
  root.textContent = `App View could not be created: ${error instanceof Error ? error.message : String(error)}`;
  return { root, dispose() {} };
}

function extensionHidden(widget) {
  return Boolean(
    widget.visibility?.suppression?.byExtension ??
      widget.hidden ??
      widget.options?.hidden,
  );
}

function setWidgetHidden(widget, hidden) {
  widget.hidden = Boolean(hidden);
  // Promoted SubgraphNode widgets are lightweight store projections rather
  // than BaseWidget instances. Their Vue-node visibility is derived from the
  // reactive options object, while legacy LiteGraph reads widget.hidden.
  if (widget.widgetId !== undefined && widget.options) {
    widget.options.hidden = Boolean(hidden);
  }
}

function measuredHeight(element, fallback) {
  const bounds = element.getBoundingClientRect();
  const measured = Math.ceil(Math.max(element.scrollHeight, bounds.height));
  return measured > 0 ? measured : fallback;
}

export function createAppViewExtension({ app, api }) {
  function resizeForMode(host, { preserveSize = false } = {}) {
    const state = host.__comfyAppView;
    if (!state) return;
    const mode = host.properties.app_view_mode === "app" ? "app" : "node";
    const minimum = host.computeSize();

    let width;
    let height;
    if (mode === "app") {
      const minimumWidth = state.renderer.minWidth ?? NODE_WIDTH;
      const preferredWidth = state.renderer.width ?? 520;
      const preferredHeight = state.renderer.height ?? 640;
      width = Math.max(
        minimumWidth,
        preserveSize
          ? host.size[0]
          : (state.appSize?.[0] ?? preferredWidth),
      );
      height = Math.max(
        minimum[1],
        preserveSize
          ? host.size[1]
          : (state.appSize?.[1] ?? preferredHeight),
      );
    } else {
      width = Math.max(
        NODE_WIDTH,
        minimum[0],
        state.nodeSize?.[0] ?? 0,
      );
      height = Math.max(minimum[1], state.nodeSize?.[1] ?? 0);
    }
    host.setSize([width, height]);
    host.graph?.setDirtyCanvas?.(true, true);
  }

  function measureAndResize(host) {
    const state = host.__comfyAppView;
    if (!state || host.properties.app_view_mode !== "app") return;
    const nextHeight = measuredHeight(
      state.view.root,
      state.renderer.height ?? 640,
    );
    if (Math.abs(nextHeight - state.panelHeight) < 2) return;
    state.panelHeight = nextHeight;
    resizeForMode(host, { preserveSize: true });
  }

  function applyMode(host, mode) {
    const normalized = mode === "app" ? "app" : "node";
    const previous =
      host.properties.app_view_mode === "app" ? "app" : "node";
    const state = host.__comfyAppView;
    if (!state) {
      host.properties.app_view_mode = normalized;
      return;
    }

    if (previous === "node" && normalized === "app") {
      state.nodeSize = [...host.size];
    } else if (previous === "app" && normalized === "node") {
      state.appSize = [...host.size];
    }

    host.properties.app_view_mode = normalized;
    const appMode = normalized === "app";
    for (const entry of state.nodeWidgets) {
      setWidgetHidden(entry.widget, appMode ? true : entry.hidden);
    }
    setWidgetHidden(state.panelWidget, !appMode);
    state.view.root.style.display = appMode ? "" : "none";
    state.view.root.classList.toggle("comfy-app-view-active", appMode);

    if (!appMode) state.view.onHide?.();
    resizeForMode(host);
    if (previous !== normalized) host.graph?.incrementVersion?.();
    if (appMode) {
      state.view.onShow?.();
      requestAnimationFrame(() => measureAndResize(host));
    }
  }

  function toggleMode(host) {
    if (!host?.__comfyAppView) return false;
    applyMode(
      host,
      host.properties.app_view_mode === "app" ? "node" : "app",
    );
    return true;
  }

  function attach(host) {
    if (!host?.subgraph || host.__comfyAppView) return false;
    const rendererId = host.properties?.app_view_renderer;
    if (!rendererId) return false;
    const renderer = rendererRegistry.get(rendererId);
    if (!renderer) {
      console.warn(`[Comfy App View] renderer is unavailable: ${rendererId}`);
      return false;
    }
    const packageInfo = rendererPackage(renderer);
    if (packageInfo) host.properties.app_view_package = packageInfo;
    addStyles();

    // Keep the normal promoted subgraph surface intact. App mode suppresses
    // those rows only while the renderer is visible and restores their exact
    // previous extension-visibility state when returning to Node mode.
    const nodeWidgets = (host.widgets ?? []).map((widget) => ({
      widget,
      hidden: extensionHidden(widget),
    }));

    let view;
    try {
      // The renderer receives the complete host, nested workflow and root graph.
      // It is not restricted to the public subgraph slots.
      view = renderer.build({ host, app, api });
    } catch (error) {
      console.error(`[Comfy App View] ${rendererId} failed`, error);
      view = buildError(error);
    }

    let panelHeight = renderer.height ?? 640;
    const panelWidget = host.addDOMWidget(
      "app_view_panel",
      "appViewPanel",
      view.root,
      {
        serialize: false,
        hideOnZoom: false,
        margin: PANEL_MARGIN,
      },
    );
    panelWidget.serialize = false;
    panelWidget.options.serialize = false;
    // A fixed-size widget is required by the legacy LiteGraph layout. Without
    // it the DOM widget is treated as growable and receives only the leftover
    // node space, which creates the inner scrollbar seen in the old renderer.
    panelWidget.computeSize = () => [
      renderer.minWidth ?? NODE_WIDTH,
      host.properties.app_view_mode === "app"
        ? panelHeight + PANEL_MARGIN
        : -4,
    ];

    const state = {
      renderer,
      panelWidget,
      view,
      nodeWidgets,
      nodeSize: [...host.size],
      appSize:
        host.properties.app_view_mode === "app"
          ? [...host.size]
          : [renderer.width ?? 520, renderer.height ?? 640],
      get panelHeight() {
        return panelHeight;
      },
      set panelHeight(value) {
        panelHeight = value;
      },
    };
    host.__comfyAppView = state;

    const observer = new ResizeObserver(() => measureAndResize(host));
    observer.observe(view.root);

    const previousRemoved = host.onRemoved;
    host.onRemoved = function () {
      observer.disconnect();
      view.dispose?.();
      return previousRemoved?.apply(this, arguments);
    };

    applyMode(host, host.properties.app_view_mode);
    console.info(
      `[Comfy App View] attached ${rendererId} to subgraph ${host.id}`,
    );
    return true;
  }

  function attachAll() {
    walkGraph(app.graph, (node) => attach(node));
  }

  function isAppViewHost(node) {
    return Boolean(node?.subgraph && node?.properties?.app_view_renderer);
  }

  return {
    attach,
    attachAll,
    applyMode,
    isAppViewHost,
    toggleMode,
  };
}
