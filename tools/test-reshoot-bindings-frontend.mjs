// Requires the Re-shoot example installed in a running ComfyUI and Playwright.
// Optional: COMFY_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, APP_VIEW_NODE2.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const workflow = JSON.parse(await readFile(
  new URL("../examples/reshoot/reshoot-app-view.json", import.meta.url), "utf8",
));

function parts(candidate) {
  const host = candidate.nodes.find((node) => node.properties?.app_view_renderer === "reshoot@1");
  const definition = candidate.definitions.subgraphs.find((item) => item.id === host.type);
  return { host, definition };
}

function caseWorkflow(change) {
  const candidate = structuredClone(workflow);
  change?.(candidate, parts(candidate));
  return candidate;
}

function addHost(candidate, host, type = host.type) {
  const copy = structuredClone(host);
  copy.id = Math.max(candidate.last_node_id ?? 0, ...candidate.nodes
    .filter((node) => typeof node.id === "number").map((node) => node.id)) + 1;
  copy.type = type;
  copy.pos = [host.pos[0] + host.size[0] + 180, host.pos[1]];
  for (const input of copy.inputs ?? []) input.link = null;
  for (const output of copy.outputs ?? []) output.links = [];
  candidate.last_node_id = copy.id;
  candidate.nodes.push(copy);
  return copy;
}

function addExternalOriginalSave(candidate, host) {
  const template = candidate.nodes.find(
    (node) => node.properties?.reshoot_role === "original-audio-save",
  );
  const save = structuredClone(template);
  save.id = Math.max(candidate.last_node_id ?? 0, ...candidate.nodes
    .filter((node) => typeof node.id === "number").map((node) => node.id)) + 1;
  save.pos = [host.pos[0] + host.size[0] + 180, host.pos[1]];
  for (const input of save.inputs ?? []) input.link = null;
  for (const output of save.outputs ?? []) output.links = [];
  const linkId = Math.max(candidate.last_link_id ?? 0, ...candidate.links.map((link) => link[0])) + 1;
  const outputSlot = host.outputs.findIndex((output) => output.name === "Original audio");
  save.inputs[0].link = linkId;
  host.outputs[outputSlot].links = [linkId];
  candidate.nodes.push(save);
  candidate.links.push([linkId, host.id, outputSlot, save.id, 0, "VIDEO"]);
  candidate.last_node_id = save.id;
  candidate.last_link_id = linkId;
}

const cases = [
  ["normal", caseWorkflow(), { errors: 0, hosts: 1 }],
  ["renamed", caseWorkflow((candidate, { definition }) => {
    for (const node of definition.nodes) node.title = `Renamed ${node.id}`;
  }), { errors: 0, hosts: 1 }],
  ["missing role", caseWorkflow((candidate, { definition }) => {
    delete definition.nodes.find((node) => node.properties?.reshoot_role === "camera")
      .properties.reshoot_role;
  }), { errors: 1, hosts: 1, message: /“camera”.*found none/ }],
  ["duplicate role", caseWorkflow((candidate, { definition }) => {
    const node = structuredClone(definition.nodes.find(
      (entry) => entry.properties?.reshoot_role === "camera",
    ));
    node.id = "duplicate-camera";
    node.pos = [node.pos[0] + 450, node.pos[1]];
    for (const input of node.inputs ?? []) input.link = null;
    for (const output of node.outputs ?? []) output.links = [];
    definition.nodes.push(node);
  }), { errors: 1, hosts: 1, message: /“camera”.*found 2/ }],
  ["duplicate output role", caseWorkflow((candidate, { definition }) => {
    const node = structuredClone(definition.nodes.find(
      (entry) => entry.properties?.reshoot_role === "generated-save",
    ));
    node.id = "duplicate-generated-save";
    node.pos = [node.pos[0] + 450, node.pos[1]];
    for (const input of node.inputs ?? []) input.link = null;
    for (const output of node.outputs ?? []) output.links = [];
    definition.nodes.push(node);
  }), { errors: 0, hosts: 1, resultMessage: /“generated-save”.*found 2/,
    bindingMessage: /“generated-save”.*found 2/ }],
  ["missing output role", caseWorkflow((candidate, { definition }) => {
    delete definition.nodes.find((entry) => entry.properties?.reshoot_role === "warp-save")
      .properties.reshoot_role;
  }), { errors: 0, hosts: 1, bindingMessage: /“warp-save”.*found none/ }],
  ["shared definition", caseWorkflow((candidate, { host }) => {
    addHost(candidate, host);
  }), { errors: 2, hosts: 2, message: /2 App hosts use the same subgraph definition/, shared: true, promotedWrappers: 0 }],
  ["separate definitions", caseWorkflow((candidate, { host, definition }) => {
    const secondDefinition = structuredClone(definition);
    secondDefinition.id = `${definition.id}-binding-test`;
    secondDefinition.name = `${definition.name} binding test`;
    candidate.definitions.subgraphs.push(secondDefinition);
    const secondHost = addHost(candidate, host, secondDefinition.id);
    addExternalOriginalSave(candidate, secondHost);
  }), { errors: 0, hosts: 2, shared: false, bindingErrors: 0 }],
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
  args: ["--use-angle=swiftshader", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.stack ?? String(error)));
let settings;

async function ready() {
  await page.waitForFunction(() => document.documentElement.dataset.comfyAppViewExtension === "loaded"
    && globalThis.LiteGraph?.registered_node_types?.CrossViewWarp);
  await page.waitForFunction(async () => {
    const { app } = await import("/scripts/app.js");
    return app.isGraphReady && !app.configuringGraph;
  });
  await page.waitForLoadState("networkidle");
}

async function load(candidate) {
  await page.evaluate(async (data) => {
    const { app } = await import("/scripts/app.js");
    window.bindingTestApp = app;
    await app.loadGraphData(data, true, true);
  }, candidate);
  await page.waitForFunction(() => {
    const hosts = window.bindingTestApp.graph.nodes.filter(
      (node) => node.properties?.app_view_renderer === "reshoot@1",
    );
    return hosts.length > 0 && hosts.every((host) => host.__comfyAppView);
  });
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const hosts = window.bindingTestApp.graph.nodes.filter(
      (node) => node.properties?.app_view_renderer === "reshoot@1",
    );
    const subgraphs = [...new Set(hosts.map((host) => host.subgraph))];
    return {
      hosts: hosts.length,
      errors: hosts.filter((host) => host.__comfyAppView.view.root
        .classList.contains("comfy-app-view-error")).map((host) => host.__comfyAppView.view.root.textContent),
      resultMessages: hosts.map((host) => host.__comfyAppView.view.panels
        ?.find((panel) => panel.id === "results")?.element.querySelector('[role="status"]')?.textContent ?? ""),
      bindingMessages: hosts.map((host) => host.__comfyAppView.view.panels
        ?.find((panel) => panel.id === "results")?.element.querySelector('[role="alert"]')?.textContent ?? ""),
      shared: hosts.length > 1 ? hosts[0].subgraph === hosts[1].subgraph : null,
      sharedCamera: hosts.length > 1 ? hosts[0].subgraph.nodes.find(
        (node) => node.properties?.reshoot_role === "camera",
      ) === hosts[1].subgraph.nodes.find(
        (node) => node.properties?.reshoot_role === "camera",
      ) : null,
      promotedWrappers: subgraphs.flatMap((subgraph) => subgraph.nodes)
        .flatMap((node) => node.widgets ?? [])
        .filter((widget) => typeof widget.callback === "function" &&
          Object.getOwnPropertySymbols(widget.callback).some(
            (symbol) => symbol.description === "reshoot-promoted-callback-previous",
          )).length,
    };
  });
}

try {
  await page.goto(process.env.COMFY_URL ?? "http://127.0.0.1:8188");
  await ready();
  settings = await page.evaluate(async () => {
    const { app } = await import("/scripts/app.js");
    return {
      node2: app.ui.settings.getSettingValue("Comfy.VueNodes.Enabled"),
      toolbox: app.ui.settings.getSettingValue("Comfy.Canvas.SelectionToolbox"),
    };
  });
  const modes = process.env.APP_VIEW_NODE2
    ? [process.env.APP_VIEW_NODE2 === "true"] : [true, false];
  for (const node2 of modes) {
    await page.evaluate(async (value) => {
      const { app } = await import("/scripts/app.js");
      await app.ui.settings.setSettingValueAsync("Comfy.VueNodes.Enabled", value);
      await app.ui.settings.setSettingValueAsync("Comfy.Canvas.SelectionToolbox", true);
    }, node2);
    await page.reload();
    await ready();
    for (const [name, candidate, expected] of cases) {
      const state = await load(candidate);
      assert.equal(state.hosts, expected.hosts, `${name}: ${JSON.stringify(state)}`);
      assert.equal(state.errors.length, expected.errors, `${name}: ${JSON.stringify(state)}`);
      if (expected.message) assert.match(state.errors.join("\n"), expected.message);
      if (expected.resultMessage) assert.match(state.resultMessages.join("\n"), expected.resultMessage);
      if (expected.bindingMessage) assert.match(state.bindingMessages.join("\n"), expected.bindingMessage);
      if (expected.bindingErrors !== undefined) {
        assert.equal(state.bindingMessages.filter(Boolean).length, expected.bindingErrors,
          `${name}: ${JSON.stringify(state)}`);
      }
      if (expected.shared !== undefined) {
        assert.equal(state.shared, expected.shared, `${name}: ${JSON.stringify(state)}`);
        assert.equal(state.sharedCamera, expected.shared, `${name}: ${JSON.stringify(state)}`);
      }
      if (expected.promotedWrappers !== undefined) {
        assert.equal(state.promotedWrappers, expected.promotedWrappers,
          `${name}: ${JSON.stringify(state)}`);
      }
      console.log(JSON.stringify({ node2, name, state }));
    }
  }
  const failures = pageErrors.filter((error) =>
    !error.includes("getCanvas: canvas is null") &&
    !error.includes("Failed to fetch dynamically imported"));
  assert.deepEqual(failures, []);
} finally {
  if (settings) {
    await page.evaluate(async (previous) => {
      const { app } = await import("/scripts/app.js");
      await app.ui.settings.setSettingValueAsync("Comfy.VueNodes.Enabled", previous.node2);
      await app.ui.settings.setSettingValueAsync("Comfy.Canvas.SelectionToolbox", previous.toolbox);
    }, settings).catch(() => undefined);
  }
  await browser.close();
}

console.log("Re-shoot binding failures are visible and independent definitions stay isolated in Node 2.0 and legacy.");
