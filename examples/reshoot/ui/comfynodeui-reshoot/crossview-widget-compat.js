import { app } from "../../../../scripts/app.js";

const RETRIES = 120;
const ORBIT_MIN = 304;
const ORBIT_MAX = 700;
const PREVIEW_MIN = 220;
const PREVIEW_MAX = 560;

function walkGraph(graph, callback) {
  for (const node of graph?.nodes ?? []) {
    callback(node);
    if (node.subgraph) walkGraph(node.subgraph, callback);
  }
}

function isCrossViewWarp(node) {
  return String(node?.type ?? "").startsWith("CrossViewWarp");
}

function targetHeight(node, minimum, maximum) {
  return Math.round(
    Math.max(minimum, Math.min(maximum, (node.size?.[0] ?? 360) * 0.85)),
  );
}

function fixElement(widget, height) {
  const element = widget?.element ?? widget?.inputEl;
  if (!element) return false;
  const value = `${height}px`;
  element.dataset.comfyCrossviewStableSize = "1";
  element.style.setProperty("height", value, "important");
  element.style.setProperty("min-height", value, "important");
  element.style.setProperty("max-height", value, "important");
  element.style.setProperty("flex", `0 0 ${value}`, "important");
  return true;
}

function applyStableSizes(node) {
  const orbit = node.widgets?.find((widget) => widget.name === "orbit");
  const preview = node.widgets?.find((widget) => widget.name === "preview");
  const orbitReady = fixElement(
    orbit,
    targetHeight(node, ORBIT_MIN, ORBIT_MAX),
  );
  const previewReady = fixElement(
    preview,
    targetHeight(node, PREVIEW_MIN, PREVIEW_MAX),
  );
  node._crossviewOrbit?.render?.(true);
  return orbitReady && previewReady;
}

function attachOrbitPointerBridge(node) {
  const editor = node._crossviewOrbit;
  const canvas = editor?.canvas;
  if (!editor || !canvas) return null;
  if (canvas.__comfyCrossViewPointerBridge) {
    return canvas.__comfyCrossViewPointerBridge;
  }
  const onPointerMove = (event) => {
    if (!editor.drag) return;
    // Vue Node 2.0's WidgetDOM stops pointermove before it reaches the
    // document-level listener used by CrossView Orbit. Handle the captured
    // pointer at its canvas and stop it here so legacy does not process twice.
    event.stopPropagation();
    editor.onMove(event);
  };
  canvas.addEventListener("pointermove", onPointerMove);
  const cleanup = () => canvas.removeEventListener("pointermove", onPointerMove);
  canvas.__comfyCrossViewPointerBridge = cleanup;
  return cleanup;
}

function attach(node, attempt = 0) {
  if (!isCrossViewWarp(node)) return;
  if (!applyStableSizes(node)) {
    if (attempt < RETRIES) {
      requestAnimationFrame(() => attach(node, attempt + 1));
    }
    return;
  }
  if (node.__comfyCrossViewStableSizing) return;
  node.__comfyCrossViewStableSizing = true;
  const removePointerBridge = attachOrbitPointerBridge(node);

  const previousResize = node.onResize;
  node.onResize = function () {
    const result = previousResize?.apply(this, arguments);
    requestAnimationFrame(() => applyStableSizes(node));
    return result;
  };

  const previousApplyView = node._crossviewApplyView;
  if (previousApplyView) {
    node._crossviewApplyView = function () {
      const result = previousApplyView.apply(this, arguments);
      requestAnimationFrame(() => applyStableSizes(node));
      return result;
    };
  }

  const elements = ["orbit", "preview"]
    .map((name) => node.widgets?.find((widget) => widget.name === name))
    .map((widget) => widget?.element ?? widget?.inputEl)
    .filter(Boolean);
  const observer = new ResizeObserver(() => applyStableSizes(node));
  for (const element of elements) observer.observe(element);

  const previousRemoved = node.onRemoved;
  node.onRemoved = function () {
    observer.disconnect();
    removePointerBridge?.();
    return previousRemoved?.apply(this, arguments);
  };
}

app.registerExtension({
  name: "comfy.nativeAppView.crossViewStableSizing",
  nodeCreated(node) {
    if (isCrossViewWarp(node)) requestAnimationFrame(() => attach(node));
  },
  afterConfigureGraph() {
    walkGraph(app.graph, (node) => attach(node));
  },
});

