import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { registerAppViewRenderer } from "../app-view-core.js";

const RENDERER = "reshoot@1";
const APP_HEIGHT = 790;
const APP_WIDTH = 520;

function addStyles() {
  if (document.getElementById("reshoot-app-view-styles")) return;
  const style = document.createElement("style");
  style.id = "reshoot-app-view-styles";
  style.textContent = `
    .reshoot-app {
      width: 100%;
      height: auto;
      overflow: visible;
      padding: 12px;
      border: 1px solid #34363c;
      border-radius: 10px;
      background: #211927;
      color: #f4f1f5;
      box-sizing: border-box;
      font: 13px system-ui, sans-serif;
      scrollbar-width: thin;
    }
    .reshoot-app * { box-sizing: border-box; }
    .reshoot-app__source {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      padding: 9px;
      border: 1px solid #403547;
      border-radius: 10px;
      background: #2a2130;
    }
    .reshoot-app__thumb {
      width: 56px;
      height: 38px;
      border-radius: 6px;
      object-fit: cover;
      background: #121014;
    }
    .reshoot-app__source select {
      min-width: 0;
      width: 100%;
      border: 0;
      background: transparent;
      color: #fff;
      font: inherit;
    }
    .reshoot-app button,
    .reshoot-app select,
    .reshoot-app textarea,
    .reshoot-app input { font: inherit; }
    .reshoot-app button {
      border: 1px solid #514757;
      border-radius: 8px;
      background: #312738;
      color: #fff;
      cursor: pointer;
    }
    .reshoot-app button:disabled { opacity: .45; cursor: default; }
    .reshoot-app__change { padding: 7px 10px; }
    .reshoot-app__hint {
      margin: 3px 0 10px;
      color: #aaa2ad;
      text-align: center;
      font-size: 11px;
    }
    .reshoot-app__camera {
      min-height: 250px;
      margin-bottom: 10px;
      border-radius: 10px;
      background: #17131a;
      overflow: hidden;
    }
    .reshoot-app__camera > div { width: 100%; }
    .reshoot-app__camera canvas {
      display: block;
      width: 100% !important;
      min-height: 250px;
    }
    .reshoot-field {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr) 58px;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      margin: 3px 0;
      padding: 0 10px;
      border: 1px solid #3e3444;
      border-radius: 8px;
      background: #29212f;
    }
    .reshoot-field__name { color: #aaa2ad; }
    .reshoot-field__value {
      color: #c7beca;
      text-align: right;
      font: 11px ui-monospace, monospace;
    }
    .reshoot-field input[type="range"] { width: 100%; accent-color: #e9fb45; }
    .reshoot-field input[type="checkbox"] { justify-self: end; }
    .reshoot-field select,
    .reshoot-field input[type="number"] {
      width: 100%;
      padding: 4px 6px;
      border: 1px solid #514757;
      border-radius: 5px;
      background: #17131a;
      color: #fff;
    }
    .reshoot-field--check { grid-template-columns: 1fr auto; }
    .reshoot-field--check .reshoot-field__value { display: none; }
    .reshoot-app details {
      margin: 8px 0;
      border: 1px solid #3e3444;
      border-radius: 9px;
      background: #251d2a;
    }
    .reshoot-app summary {
      padding: 10px 12px;
      cursor: pointer;
      color: #d2cbd4;
      font-weight: 650;
    }
    .reshoot-app details > div { padding: 0 8px 8px; }
    .reshoot-app__prompt {
      width: 100%;
      min-height: 64px;
      margin: 8px 0;
      padding: 9px;
      border: 1px solid #514757;
      border-radius: 8px;
      resize: vertical;
      background: #17131a;
      color: #fff;
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

function findRole(host, role) {
  return host.subgraph?.nodes?.find(
    (node) => node.properties?.reshoot_role === role,
  );
}

function widget(node, name, type) {
  return node?.widgets?.find(
    (item) => item.name === name && (!type || item.type === type),
  );
}

function setWidget(node, name, value) {
  const target = widget(node, name);
  if (!target) return false;
  const oldValue = target.value;
  target.value = value;
  target.callback?.(value, app.canvas, node);
  node.onWidgetChanged?.(name, value, oldValue, target);
  node.graph?.incrementVersion?.();
  node.graph?.setDirtyCanvas?.(true, true);
  return true;
}

function bridgePromotedWidgets(host, specifications) {
  const bindings = [];
  for (const { node, name } of specifications) {
    const inner = widget(node, name);
    const outer = host.widgets?.find((candidate) => candidate.name === name);
    if (!inner || !outer) continue;

    let syncing = false;
    let lastInner = inner.value;
    let lastOuter = outer.value;
    const previousCallback = inner.callback;
    const writeOuter = (value) => {
      if (!syncing && !Object.is(outer.value, value)) {
        const previous = outer.value;
        syncing = true;
        try {
          outer.value = value;
          outer.callback?.(value, app.canvas, host);
          host.onWidgetChanged?.(name, value, previous, outer);
          host.graph?.incrementVersion?.();
          host.graph?.setDirtyCanvas?.(true, true);
        } finally {
          syncing = false;
        }
      }
      lastInner = inner.value;
      lastOuter = outer.value;
    };
    const wrappedCallback = function (value) {
      previousCallback?.apply(this, arguments);
      writeOuter(value ?? inner.value);
    };
    inner.callback = wrappedCallback;

    bindings.push({
      inner,
      outer,
      node,
      name,
      previousCallback,
      wrappedCallback,
      reconcile() {
        if (syncing) return;
        const innerChanged = !Object.is(inner.value, lastInner);
        const outerChanged = !Object.is(outer.value, lastOuter);

        if (innerChanged && !outerChanged) {
          writeOuter(inner.value);
          return;
        }
        if (!innerChanged && outerChanged) {
          const previous = inner.value;
          syncing = true;
          try {
            inner.value = outer.value;
            inner.callback?.(outer.value, app.canvas, node);
            node.onWidgetChanged?.(name, outer.value, previous, inner);
            node.graph?.setDirtyCanvas?.(true, true);
          } finally {
            syncing = false;
          }
          lastInner = inner.value;
          lastOuter = outer.value;
          return;
        }
        if (innerChanged && outerChanged && !Object.is(inner.value, outer.value)) {
          if (host.properties?.app_view_mode === "app") {
            writeOuter(inner.value);
          } else {
            const previous = inner.value;
            syncing = true;
            try {
              inner.value = outer.value;
              inner.callback?.(outer.value, app.canvas, node);
              node.onWidgetChanged?.(name, outer.value, previous, inner);
              node.graph?.setDirtyCanvas?.(true, true);
            } finally {
              syncing = false;
            }
            lastInner = inner.value;
            lastOuter = outer.value;
          }
          return;
        }
        lastInner = inner.value;
        lastOuter = outer.value;
      },
    });
  }

  return {
    syncFromHost() {
      for (const binding of bindings) binding.reconcile();
    },
    dispose() {
      for (const binding of bindings) {
        if (binding.inner.callback === binding.wrappedCallback) {
          binding.inner.callback = binding.previousCallback;
        }
      }
    },
  };
}

function valuesOf(target) {
  const values = target?.options?.values;
  if (typeof values === "function") return values();
  return Array.isArray(values) ? values : [];
}

function inputMediaUrl(value) {
  if (!value || typeof value !== "string") return "";
  const clean = value.replace(/\s+\[(input|output|temp)\]$/i, "");
  const parts = clean.replaceAll("\\", "/").split("/");
  const filename = parts.pop() ?? clean;
  const subfolder = parts.join("/");
  const query = new URLSearchParams({ filename, subfolder, type: "input" });
  return api.apiURL(`/view?${query}`);
}

function pathToGraph(root, target, path = []) {
  if (root === target) return path;
  for (const node of root?.nodes ?? []) {
    if (!node.subgraph) continue;
    const found = pathToGraph(node.subgraph, target, [...path, node.id]);
    if (found) return found;
  }
  return null;
}

function executionId(node) {
  if (!node?.graph) return null;
  const path = pathToGraph(app.graph, node.graph);
  if (!path) return null;
  return [...path, node.id].join(":");
}

function patchCrossViewPreviewId(camera) {
  const editor = camera?._crossviewPreview;
  if (!editor || editor.__reshootExecutionIdPatched) return;
  const target = camera;
  editor.node = new Proxy(target, {
    get(object, property) {
      if (property === "id") return executionId(object) ?? object.id;
      const value = Reflect.get(object, property, object);
      return typeof value === "function" ? value.bind(object) : value;
    },
    set(object, property, value) {
      return Reflect.set(object, property, value, object);
    },
  });
  editor.__reshootExecutionIdPatched = true;
}

function createCameraWidgetBorrower(host, cameraMount) {
  const camera = findRole(host, "camera");
  const borrowed = new Map();

  return {
    borrow() {
      if (!camera) return;
      patchCrossViewPreviewId(camera);
      for (const name of ["orbit", "preview"]) {
        const item = camera.widgets?.find((candidate) => candidate.name === name);
        const element = item?.element ?? item?.inputEl;
        if (!element || element.parentElement === cameraMount) continue;
        borrowed.set(element, {
          parent: element.parentElement,
          nextSibling: element.nextSibling,
        });
        cameraMount.appendChild(element);
      }
      camera._crossviewApplyView?.();
      // CrossView starts its animation loop while the inner subgraph is not
      // mounted, so the loop can stop before this canvas enters the App View.
      // A forced render makes the borrowed surface live immediately; the App
      // View sync keeps external widget edits visible as well.
      camera._crossviewOrbit?.render?.(true);
    },
    restore() {
      for (const [element, { parent, nextSibling }] of borrowed) {
        if (element.parentElement !== cameraMount) continue;
        if (!parent) {
          element.remove();
        } else if (nextSibling?.parentElement === parent) {
          parent.insertBefore(element, nextSibling);
        } else {
          parent.appendChild(element);
        }
      }
      borrowed.clear();
      camera?._crossviewApplyView?.();
    },
    get count() {
      return borrowed.size;
    },
  };
}

function borrowCameraWidgets(borrower, active) {
  if (active) {
    borrower.borrow();
  } else {
    borrower.restore();
  }
}

function createRange({ node, name, label, suffix = "" }) {
  const target = widget(node, name);
  if (!target) return null;
  const row = document.createElement("label");
  row.className = "reshoot-field";
  const title = document.createElement("span");
  title.className = "reshoot-field__name";
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(target.options?.min ?? 0);
  input.max = String(target.options?.max ?? 100);
  input.step = String(target.options?.step ?? 1);
  const readout = document.createElement("span");
  readout.className = "reshoot-field__value";
  input.addEventListener("input", () => {
    setWidget(node, name, Number(input.value));
    readout.textContent = `${input.value}${suffix}`;
  });
  row.append(title, input, readout);
  return {
    element: row,
    sync() {
      const value = Number(target.value ?? 0);
      input.value = String(value);
      readout.textContent = `${value}${suffix}`;
    },
  };
}

function createCheckbox({ node, name, label }) {
  const target = widget(node, name);
  if (!target) return null;
  const row = document.createElement("label");
  row.className = "reshoot-field reshoot-field--check";
  const title = document.createElement("span");
  title.className = "reshoot-field__name";
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.addEventListener("change", () => setWidget(node, name, input.checked));
  const readout = document.createElement("span");
  readout.className = "reshoot-field__value";
  row.append(title, input, readout);
  return {
    element: row,
    sync() {
      input.checked = Boolean(target.value);
    },
  };
}

function createSelect({ node, name, label, options }) {
  const target = widget(node, name);
  if (!target) return null;
  const row = document.createElement("label");
  row.className = "reshoot-field";
  const title = document.createElement("span");
  title.className = "reshoot-field__name";
  title.textContent = label;
  const select = document.createElement("select");
  const values = options ?? valuesOf(target);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = String(value.value ?? value);
    option.textContent = String(value.label ?? value);
    select.appendChild(option);
  }
  select.addEventListener("change", () => setWidget(node, name, select.value));
  const readout = document.createElement("span");
  readout.className = "reshoot-field__value";
  row.append(title, select, readout);
  return {
    element: row,
    sync() {
      select.value = String(target.value ?? "");
      readout.textContent = select.selectedOptions[0]?.textContent ?? "";
    },
  };
}

function createNumber({ node, name, label }) {
  const target = widget(node, name);
  if (!target) return null;
  const row = document.createElement("label");
  row.className = "reshoot-field";
  const title = document.createElement("span");
  title.className = "reshoot-field__name";
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(target.options?.min ?? 0);
  input.max = String(target.options?.max ?? Number.MAX_SAFE_INTEGER);
  input.step = String(target.options?.step ?? 1);
  input.addEventListener("change", () => setWidget(node, name, Number(input.value)));
  const readout = document.createElement("span");
  readout.className = "reshoot-field__value";
  row.append(title, input, readout);
  return {
    element: row,
    sync() {
      input.value = String(target.value ?? 0);
      readout.textContent = String(target.value ?? 0);
    },
  };
}

function appendControl(parent, controls, control) {
  if (!control) return;
  parent.appendChild(control.element);
  controls.push(control);
}

function buildApp({ host }) {
  addStyles();
  const source = findRole(host, "source-video");
  const prepare = findRole(host, "prepare");
  const camera = findRole(host, "camera");
  const promptNode = findRole(host, "prompt");
  const seedNode = host.subgraph?.nodes?.find((node) => node.type === "RandomNoise");

  if (!source || !prepare || !camera || !promptNode) {
    throw new Error("Re-shoot roles are incomplete inside the subgraph");
  }

  const promotedBridge = bridgePromotedWidgets(host, [
    { node: source, name: "file" },
    { node: prepare, name: "duration" },
    { node: prepare, name: "aspect_ratio" },
    { node: prepare, name: "megapixels" },
    { node: camera, name: "azimuth" },
    { node: camera, name: "elevation" },
    { node: camera, name: "distance" },
    { node: camera, name: "hfov" },
    { node: camera, name: "vertical_shift" },
    { node: camera, name: "keep_source_aim" },
    { node: camera, name: "use_keyframes" },
    { node: camera, name: "interp_motion" },
    { node: promptNode, name: "prompt" },
    { node: seedNode, name: "noise_seed" },
  ]);

  const root = document.createElement("div");
  root.className = "reshoot-app";
  root.dataset.reshootApp = "1";

  const sourceRow = document.createElement("div");
  sourceRow.className = "reshoot-app__source";
  const sourcePreview = document.createElement("video");
  sourcePreview.className = "reshoot-app__thumb";
  sourcePreview.muted = true;
  sourcePreview.playsInline = true;
  const sourceSelect = document.createElement("select");
  const changeButton = document.createElement("button");
  changeButton.className = "reshoot-app__change";
  changeButton.type = "button";
  changeButton.textContent = "Change";
  sourceRow.append(sourcePreview, sourceSelect, changeButton);
  root.appendChild(sourceRow);

  const hint = document.createElement("p");
  hint.className = "reshoot-app__hint";
  hint.textContent = "Drag the camera around your clip · scroll to move closer";
  root.appendChild(hint);

  const cameraMount = document.createElement("div");
  cameraMount.className = "reshoot-app__camera";
  root.appendChild(cameraMount);
  const cameraWidgets = createCameraWidgetBorrower(host, cameraMount);

  const controls = [];
  appendControl(root, controls, createRange({ node: camera, name: "azimuth", label: "Rotation", suffix: "°" }));
  appendControl(root, controls, createRange({ node: camera, name: "elevation", label: "Tilt", suffix: "°" }));
  appendControl(root, controls, createRange({ node: camera, name: "distance", label: "Distance", suffix: "×" }));
  appendControl(root, controls, createRange({ node: camera, name: "hfov", label: "Lens", suffix: "°" }));
  appendControl(root, controls, createRange({ node: camera, name: "vertical_shift", label: "Height" }));
  appendControl(root, controls, createCheckbox({ node: camera, name: "keep_source_aim", label: "Keep the source camera's aim" }));

  const cameraMove = document.createElement("details");
  const cameraSummary = document.createElement("summary");
  cameraSummary.textContent = "CAMERA MOVE";
  const cameraMoveBody = document.createElement("div");
  cameraMove.append(cameraSummary, cameraMoveBody);
  appendControl(cameraMoveBody, controls, createCheckbox({ node: camera, name: "use_keyframes", label: "Use keyframed camera move" }));
  appendControl(cameraMoveBody, controls, createSelect({ node: camera, name: "interp_motion", label: "Motion" }));
  root.appendChild(cameraMove);

  const advanced = document.createElement("details");
  const advancedSummary = document.createElement("summary");
  advancedSummary.textContent = "ADVANCED";
  const advancedBody = document.createElement("div");
  advanced.append(advancedSummary, advancedBody);
  appendControl(advancedBody, controls, createSelect({ node: prepare, name: "aspect_ratio", label: "Aspect" }));
  appendControl(advancedBody, controls, createSelect({
    node: prepare,
    name: "megapixels",
    label: "Resolution",
    options: [
      { value: 0.4, label: "480p · 0.4 MP" },
      { value: 0.5, label: "Source · 0.5 MP" },
      { value: 1, label: "768p · 1 MP" },
    ],
  }));
  appendControl(advancedBody, controls, createRange({ node: prepare, name: "duration", label: "Duration", suffix: " s" }));
  appendControl(advancedBody, controls, createNumber({ node: seedNode, name: "noise_seed", label: "Seed" }));
  root.appendChild(advanced);

  const prompt = document.createElement("textarea");
  prompt.className = "reshoot-app__prompt";
  prompt.placeholder = "Describe what the new view should reveal (optional)";
  prompt.addEventListener("input", () => setWidget(promptNode, "prompt", prompt.value));
  root.appendChild(prompt);

  changeButton.addEventListener("click", () => {
    const upload = source.widgets?.find(
      (item) => item.name === "upload" || item.type === "button",
    );
    upload?.callback?.();
  });

  sourceSelect.addEventListener("change", () => {
    setWidget(source, "file", sourceSelect.value);
  });

  const fileWidget = widget(source, "file");
  let lastSource = null;
  const sync = () => {
    promotedBridge.syncFromHost();
    const selected = String(fileWidget?.value ?? "");
    const sourceValues = valuesOf(fileWidget).map(String);
    if (selected && !sourceValues.includes(selected)) sourceValues.unshift(selected);
    const signature = sourceValues.map(String).join("\u0000");
    if (sourceSelect.dataset.signature !== signature) {
      sourceSelect.replaceChildren();
      for (const value of sourceValues) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = String(value).split("/").at(-1);
        sourceSelect.appendChild(option);
      }
      sourceSelect.dataset.signature = signature;
    }
    sourceSelect.value = selected;
    if (selected !== lastSource) {
      lastSource = selected;
      sourcePreview.src = inputMediaUrl(selected);
      sourcePreview.load();
    }
    for (const control of controls) control.sync();
    const promptWidget = widget(promptNode, "prompt");
    if (document.activeElement !== prompt) prompt.value = String(promptWidget?.value ?? "");
    borrowCameraWidgets(
      cameraWidgets,
      host.properties?.app_view_mode === "app" && root.isConnected,
    );
    if (host.properties?.app_view_mode === "app") {
      camera._crossviewOrbit?.render?.(true);
    }
    root.dataset.cameraExecutionId = executionId(camera) ?? "";
    root.dataset.previewExecutionId = String(
      camera._crossviewPreview?.node?.id ?? "",
    );
    root.dataset.sourceUploadAvailable = String(
      source.widgets?.some(
        (item) => item.name === "upload" || item.type === "button",
      ) ?? false,
    );
  };

  const timer = window.setInterval(sync, 250);
  sync();
  return {
    root,
    cameraMount,
    sync,
    onShow() {
      requestAnimationFrame(() => {
        cameraWidgets.borrow();
        sync();
      });
    },
    onHide() {
      cameraWidgets.restore();
    },
    dispose() {
      window.clearInterval(timer);
      cameraWidgets.restore();
      promotedBridge.dispose();
    },
  };
}


export const reshootRenderer = {
  id: RENDERER,
  width: APP_WIDTH,
  minWidth: 420,
  height: APP_HEIGHT,
  build: buildApp,
};

registerAppViewRenderer(reshootRenderer);

