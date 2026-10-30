import { registerAppViewRenderer } from "../../app-view-core.js";

const RENDERER = "minimax-h3-i2v@1";

function addStyles() {
  if (document.getElementById("minimax-h3-i2v-app-view-styles")) return;
  const style = document.createElement("style");
  style.id = "minimax-h3-i2v-app-view-styles";
  style.textContent = `
    .h3-i2v-app {
      width: 100%;
      height: auto;
      container-type: inline-size;
      overflow: visible;
      padding: 14px;
      border: 1px solid #34363c;
      border-radius: 10px;
      background: #181a1f;
      color: #f3f4f6;
      box-sizing: border-box;
      font: 13px system-ui, sans-serif;
    }
    .h3-i2v-app * { box-sizing: border-box; }
    .h3-i2v-app__source {
      position: relative;
      height: clamp(160px, 52cqw, 300px);
      margin-bottom: 12px;
      overflow: hidden;
      border: 1px solid #383b43;
      border-radius: 9px;
      background: #0d0f13;
    }
    .h3-i2v-app__source img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .h3-i2v-app__source button {
      position: absolute;
      right: 9px;
      bottom: 9px;
    }
    .h3-i2v-app textarea {
      width: 100%;
      min-height: 120px;
      padding: 9px;
      border: 1px solid #424650;
      border-radius: 7px;
      resize: vertical;
      background: #101217;
      color: #fff;
      font: inherit;
    }
    .h3-i2v-app__grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 10px 0;
    }
    .h3-i2v-app label {
      display: grid;
      gap: 4px;
      color: #afb3bc;
      font-size: 11px;
    }
    .h3-i2v-app input {
      width: 100%;
      min-height: 32px;
      padding: 5px 7px;
      border: 1px solid #424650;
      border-radius: 6px;
      background: #101217;
      color: #fff;
    }
    .h3-i2v-app button {
      min-height: 34px;
      padding: 6px 11px;
      border: 1px solid #4a4e59;
      border-radius: 7px;
      background: #2b2f38;
      color: #fff;
      cursor: pointer;
    }
    @container (max-width: 390px) {
      .h3-i2v-app__grid { grid-template-columns: 1fr; }
      .h3-i2v-app textarea { min-height: 96px; }
    }
  `;
  document.head.appendChild(style);
}

function graphLink(graph, linkId) {
  return graph?.getLink?.(linkId) ?? graph?.links?.get?.(linkId);
}

function sourceNode(host, inputName) {
  const input = host.inputs?.find((candidate) => candidate.name === inputName);
  const link = input?.link == null ? null : graphLink(host.graph, input.link);
  return link ? host.graph?.getNodeById?.(link.origin_id) : null;
}

function widget(node, name) {
  return node?.widgets?.find((candidate) => candidate.name === name);
}

function setWidget(node, name, value) {
  const target = widget(node, name);
  if (!target) return false;
  const oldValue = target.value;
  target.value = value;
  target.callback?.(value, null, node);
  node.onWidgetChanged?.(name, value, oldValue, target);
  node.graph?.incrementVersion?.();
  node.graph?.setDirtyCanvas?.(true, true);
  return true;
}

function inputMediaUrl(api, value) {
  if (!value || typeof value !== "string") return "";
  const clean = value.replace(/\s+\[(input|output|temp)\]$/i, "");
  const parts = clean.replaceAll("\\", "/").split("/");
  const filename = parts.pop() ?? clean;
  const subfolder = parts.join("/");
  return api.apiURL(
    `/view?${new URLSearchParams({ filename, subfolder, type: "input" })}`,
  );
}

function numberField(host, name, label) {
  const target = widget(host, name);
  if (!target) return null;
  const row = document.createElement("label");
  row.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(target.options?.min ?? 0);
  input.max = String(target.options?.max ?? Number.MAX_SAFE_INTEGER);
  input.step = String(target.options?.step ?? 1);
  input.addEventListener("change", () => setWidget(host, name, Number(input.value)));
  row.appendChild(input);
  return {
    row,
    sync() {
      if (document.activeElement !== input) input.value = String(target.value ?? 0);
    },
  };
}

function build({ host, api }) {
  addStyles();
  const root = document.createElement("div");
  root.className = "h3-i2v-app";
  root.dataset.minimaxH3I2vApp = "1";

  const source = document.createElement("div");
  source.className = "h3-i2v-app__source";
  const image = document.createElement("img");
  image.alt = "First frame";
  const change = document.createElement("button");
  change.type = "button";
  change.textContent = "Choose first frame";
  source.append(image, change);
  root.appendChild(source);

  const prompt = document.createElement("textarea");
  prompt.placeholder = "Describe the video";
  prompt.addEventListener("input", () => setWidget(host, "prompt", prompt.value));
  root.appendChild(prompt);

  const grid = document.createElement("div");
  grid.className = "h3-i2v-app__grid";
  const fields = [
    numberField(host, "width", "Width"),
    numberField(host, "height", "Height"),
    numberField(host, "value_1", "Duration"),
    numberField(host, "noise_seed", "Seed"),
  ].filter(Boolean);
  for (const field of fields) grid.appendChild(field.row);
  root.appendChild(grid);

  change.addEventListener("click", () => {
    const loadImage = sourceNode(host, "first_frame");
    const upload = loadImage?.widgets?.find(
      (candidate) => candidate.name === "upload" || candidate.type === "button",
    );
    upload?.callback?.();
  });

  let lastImage = null;
  const sync = () => {
    const promptWidget = widget(host, "prompt");
    if (document.activeElement !== prompt) {
      prompt.value = String(promptWidget?.value ?? "");
    }
    for (const field of fields) field.sync();

    const loadImage = sourceNode(host, "first_frame");
    const imageWidget = widget(loadImage, "image");
    const selected = String(imageWidget?.value ?? "");
    if (selected !== lastImage) {
      lastImage = selected;
      image.src = inputMediaUrl(api, selected);
    }
    root.dataset.firstFrameNode = String(loadImage?.id ?? "");
  };

  const timer = window.setInterval(sync, 250);
  sync();
  return {
    root,
    sync,
    onShow: sync,
    dispose() {
      window.clearInterval(timer);
    },
  };
}

export const minimaxH3ImageToVideoRenderer = {
  id: RENDERER,
  name: "MiniMax H3 Image to Video",
  source: import.meta.url,
  width: 500,
  minWidth: 320,
  height: 590,
  build,
};

registerAppViewRenderer(minimaxH3ImageToVideoRenderer);
