// Migrate only the two known defects in the released Re-shoot example.
// Connections are identified by roles and socket names, never by node numbers.
export function reserveReshootVideoSpace(definition, source) {
  if (!Array.isArray(source.pos) || !Array.isArray(source.size)) return;
  source.size[1] = Math.max(source.size[1], 520);
  const below = definition.nodes.filter((node) => Array.isArray(node.pos) &&
    Math.abs(node.pos[0] - source.pos[0]) < 40 && node.pos[1] > source.pos[1]);
  const nearest = Math.min(...below.map((node) => node.pos[1]));
  const offset = Math.max(0, source.pos[1] + source.size[1] + 40 - nearest);
  if (offset) for (const node of below) node.pos[1] += offset;
}

export function repairLegacyReshootWorkflow(workflow) {
  const definitions = workflow?.definitions?.subgraphs ?? [];
  const containers = [workflow, ...definitions];
  let repaired = 0;
  for (const definition of definitions) {
    const hosts = containers.flatMap((graph) => (graph.nodes ?? [])
      .filter((node) => node.type === definition.id && node.properties?.app_view_renderer === "reshoot@1")
      .map((node) => ({ graph, node })));
    if (!hosts.length) continue;
    const role = (name) => definition.nodes?.find((node) => node.properties?.reshoot_role === name);
    const prepare = role("prepare"), prompt = role("prompt"), source = role("source-video");
    if (!prepare || !prompt || source?.type !== "LoadVideo") continue;

    const names = ["width", "height", "length"];
    const links = names.map((name) => {
      const slot = prepare.outputs?.findIndex((output) => output.name === name);
      return definition.links.find((link) => link.origin_id === prepare.id &&
        link.origin_slot === slot && link.target_id === prompt.id);
    });
    const oldTargets = ["height", "length", "ref_image_size"];
    if (prompt.inputs.find((input) => input.name === "width")?.link == null &&
        links.every((link, index) => link && prompt.inputs[link.target_slot]?.name === oldTargets[index])) {
      for (const input of prompt.inputs) if (links.some((link) => link.id === input.link)) input.link = null;
      links.forEach((link, index) => {
        link.target_slot = prompt.inputs.findIndex((input) => input.name === names[index]);
        link.type = prompt.inputs[link.target_slot].type;
        prompt.inputs[link.target_slot].link = link.id;
      });
      repaired++;
    }

    // Do not remove a deliberately wired media input, or collapse different
    // per-instance files into one shared definition. Those are authored graphs.
    if (hosts.length !== 1) continue;
    const { graph, node: host } = hosts[0];
    const outerIndex = host.inputs?.findIndex((input) => input.name === "file") ?? -1;
    const innerIndex = definition.inputs?.findIndex((input) => input.name === "file") ?? -1;
    const fileInput = source.inputs?.find((input) => input.name === "file");
    if (outerIndex < 0 || innerIndex < 0 || host.inputs[outerIndex].link != null || fileInput?.link == null) continue;
    const promotion = definition.links.find((link) => link.id === fileInput.link);
    if (!promotion || promotion.origin_id !== -10 || promotion.origin_slot !== innerIndex ||
        promotion.target_id !== source.id || definition.inputs[innerIndex].linkIds?.length !== 1) continue;
    const widgetIndex = host.inputs.slice(0, outerIndex).filter((input) => input.widget).length;
    const value = host.widgets_values_named?.file ?? host.widgets_values?.[widgetIndex];
    if (typeof value !== "string") continue;

    source.widgets_values_named ??= {};
    source.widgets_values_named.file = value;
    const innerWidgetIndex = source.inputs.filter((input) => input.widget).findIndex((input) => input.name === "file");
    if (Array.isArray(source.widgets_values) && innerWidgetIndex >= 0) source.widgets_values[innerWidgetIndex] = value;
    fileInput.link = null;
    definition.links = definition.links.filter((link) => link !== promotion);
    definition.inputs.splice(innerIndex, 1);
    for (const link of definition.links) {
      if (link.origin_id === -10 && link.origin_slot > innerIndex) link.origin_slot--;
    }
    host.inputs.splice(outerIndex, 1);
    if (Array.isArray(host.widgets_values)) host.widgets_values.splice(widgetIndex, 1);
    if (host.widgets_values_named) delete host.widgets_values_named.file;
    reserveReshootVideoSpace(definition, source);
    for (const link of graph.links ?? []) {
      if (Array.isArray(link)) {
        if (link[3] === host.id && link[4] > outerIndex) link[4]--;
      } else if (link.target_id === host.id && link.target_slot > outerIndex) link.target_slot--;
    }
    repaired++;
  }
  return repaired;
}
