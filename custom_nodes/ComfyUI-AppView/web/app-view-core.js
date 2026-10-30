import { createAppViewShell } from './app-view-shell.js';

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
    .comfy-app-view-layout-command { display:block; width:20px; height:16px;
      border:1.5px solid currentColor; border-radius:2px; position:relative; }
    .comfy-app-view-layout-command[data-expanded="true"]::after {
      content:""; position:absolute; left:36%; top:0; bottom:0; border-left:1.5px solid currentColor;
    }
    .comfy-app-shell { width:100%; height:auto !important; flex:0 0 auto !important;
      box-sizing:border-box; display:grid; grid-template-columns:minmax(0,1fr);
      align-items:start; align-content:start; gap:12px; color:var(--fg-color,#ddd); }
    .comfy-app-shell *, .comfy-app-shell *::before, .comfy-app-shell *::after { box-sizing:border-box; }
    .comfy-app-shell[data-layout="expanded"] { grid-template-columns:var(--app-primary-width,420px) minmax(360px,1fr); }
    .comfy-app-shell [hidden] { display:none !important; }
    .comfy-app-shell__primary, .comfy-app-shell__detail { min-width:0; align-self:start; }
    .comfy-app-shell__nav { display:flex; gap:4px; border-bottom:1px solid #424248; margin-bottom:12px; }
    .comfy-app-shell__nav button { font:13px system-ui; color:inherit; background:transparent;
      padding:10px 16px; border:0; border-bottom:2px solid transparent; cursor:pointer; }
    .comfy-app-shell__nav button[aria-current="page"] { border-bottom-color:#d9ef65; color:#f0f0f2; }
    .comfy-app-shell button:focus-visible, .comfy-app-shell input:focus-visible,
    .comfy-app-shell select:focus-visible { outline:2px solid #d9ef65; outline-offset:2px; }
    .lg-node:has(.comfy-app-view-active) .lg-node-widgets {
      display:flex !important; flex-direction:column; flex:0 0 auto !important;
      gap:0; align-content:start; justify-content:flex-start;
    }
    .lg-node:has(.comfy-app-view-active) .lg-node-widgets > div:not(:has([data-widget-name="app_view_panel"])) { display:none !important; }
    .lg-node:has(.comfy-app-view-active) [data-widget-name="app_view_panel"] { align-self:stretch; align-items:start; }
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
  // Layout units, not screen pixels: getBoundingClientRect includes canvas zoom.
  const measured = Math.ceil(Math.max(element.scrollHeight, element.offsetHeight));
  return measured > 0 ? measured : fallback;
}

export function createAppViewExtension({ app, api }) {
  function refreshViewVisibility(host) {
    const state = host.__comfyAppView;
    if (!state) return;
    const active = host.properties.app_view_mode === "app" &&
      host.graph === app.canvas?.graph;
    if (state.viewActive === active) return;
    state.viewActive = active;
    state.shell.setActive(active);
    if (active) state.view.onShow?.();
    else state.view.onHide?.();
  }

  function refreshVisibility() {
    walkGraph(app.graph, refreshViewVisibility);
  }

  function resizeForMode(host, { preserveSize = false } = {}) {
    const state = host.__comfyAppView;
    if (!state) return;
    const mode = host.properties.app_view_mode === "app" ? "app" : "node";
    const minimum = host.computeSize();

    let width;
    let height;
    if (mode === "app") {
      const expanded = host.properties.app_view_layout === 'expanded' && state.shell.hasPanels;
      const minimumWidth = expanded ? (state.renderer.primaryWidth ?? 420) + 400 : state.renderer.minWidth ?? NODE_WIDTH;
      const preferredWidth = expanded ? state.renderer.expandedWidth ?? 1080 : state.renderer.width ?? 520;
      const preferredHeight = state.renderer.height ?? 640;
      width = Math.max(
        minimumWidth,
        preserveSize
          ? host.size[0]
          : (state.layoutWidths[expanded ? 'expanded' : 'compact'] ?? preferredWidth),
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
    if (!state.shell.root.isConnected || !state.viewActive) return;
    const nextHeight = measuredHeight(
      state.shell.root,
      state.renderer.height ?? 640,
    );
    if (Math.abs(nextHeight - state.panelHeight) < 2) return;
    state.panelHeight = nextHeight;
    // Fit the content's absolute minimum. Borrowed widgets can mount in several
    // frames; adding each height delta to a saved node accumulates empty space.
    const min = host.computeSize();
    host.setSize([host.size[0], Math.max(min[1], nextHeight)]);
    host.graph?.setDirtyCanvas?.(true, true);
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
      state.layoutWidths[host.properties.app_view_layout === 'expanded' ? 'expanded' : 'compact'] = host.size[0];
    }

    host.properties.app_view_mode = normalized;
    const appMode = normalized === "app";
    for (const entry of state.nodeWidgets) {
      setWidgetHidden(entry.widget, appMode ? true : entry.hidden);
    }
    setWidgetHidden(state.panelWidget, !appMode);
    state.shell.root.style.display = appMode ? "" : "none";
    state.shell.root.classList.toggle("comfy-app-view-active", appMode);
    state.shell.update();

    refreshViewVisibility(host);
    resizeForMode(host);
    if (previous !== normalized) host.graph?.incrementVersion?.();
    if (appMode) {
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

  function toggleLayout(host) {
    if (!isAppViewHost(host)) return false;
    const state = host.__comfyAppView;
    const wasExpanded = host.properties.app_view_layout === 'expanded';
    if (state && host.properties.app_view_mode === 'app') {
      state.layoutWidths[wasExpanded ? 'expanded' : 'compact'] = host.size[0];
    }
    host.properties.app_view_layout = wasExpanded ? 'compact' : 'expanded';
    state?.shell.update();
    if (state && host.properties.app_view_mode === 'app') {
      resizeForMode(host);
      requestAnimationFrame(() => measureAndResize(host));
    }
    host.graph?.incrementVersion?.();
    return true;
  }

  function openPanel(host, id) {
    const state = host.__comfyAppView;
    if (!state?.view.panels?.some(panel => panel.id === id)) return false;
    host.properties.app_view_section = id;
    if (host.properties.app_view_layout !== 'expanded') toggleLayout(host);
    else { state.shell.update(); requestAnimationFrame(() => measureAndResize(host)); }
    host.graph?.incrementVersion?.();
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
      view = renderer.build({ host, app, api, openPanel: id => openPanel(host, id) });
    } catch (error) {
      console.error(`[Comfy App View] ${rendererId} failed`, error);
      view = buildError(error);
    }

    const shell = createAppViewShell({host, view, onChange: () => requestAnimationFrame(() => measureAndResize(host))});
    shell.root.style.setProperty('--app-primary-width', `${renderer.primaryWidth ?? 420}px`);
    let panelHeight = renderer.height ?? 640;
    const panelWidget = host.addDOMWidget(
      "app_view_panel",
      "appViewPanel",
      shell.root,
      {
        serialize: false,
        hideOnZoom: false,
        margin: PANEL_MARGIN,
        getMinHeight: () => panelHeight,
        getMaxHeight: () => panelHeight,
        getHeight: () => panelHeight,
      },
    );
    panelWidget.serialize = false;
    panelWidget.options.serialize = false;
    // A fixed-size widget is required by the legacy LiteGraph layout. Without
    // it the DOM widget is treated as growable and receives only the leftover
    // node space, which creates the inner scrollbar seen in the old renderer.
    panelWidget.computeSize = () => [
      host.properties.app_view_mode === 'app' && host.properties.app_view_layout === 'expanded' && shell.hasPanels
        ? (renderer.primaryWidth ?? 420) + 400 : renderer.minWidth ?? NODE_WIDTH,
      host.properties.app_view_mode === "app"
        ? panelHeight + PANEL_MARGIN
        : -4,
    ];

    const state = {
      renderer,
      shell,
      panelWidget,
      view,
      viewActive: false,
      nodeWidgets,
      nodeSize: [...host.size],
      layoutWidths: host.properties.app_view_mode === 'app'
        ? { [host.properties.app_view_layout === 'expanded' ? 'expanded' : 'compact']: host.size[0] }
        : {},
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
    observer.observe(shell.root);

    const previousRemoved = host.onRemoved;
    host.onRemoved = function () {
      observer.disconnect();
      if (state.viewActive) view.onHide?.();
      state.viewActive = false;
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
    refreshVisibility,
    toggleMode,
    toggleLayout,
    openPanel,
  };
}
