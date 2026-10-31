const REQUIRED_INNER_BINDINGS = [
  ["source", "source-video", "LoadVideo"],
  ["prepare", "prepare", "CrossViewPrepareClip"],
  ["camera", "camera", "CrossViewWarp"],
  ["prompt", "prompt", "MiniMaxH3ReferenceToVideo"],
  ["seed", "seed", "RandomNoise"],
];

function roleNodes(nodes, role) {
  return (nodes ?? []).filter((node) => node.properties?.reshoot_role === role);
}

function workflowNodes(graph, visited = new Set(), nodes = []) {
  if (!graph || visited.has(graph)) return nodes;
  visited.add(graph);
  for (const node of graph.nodes ?? []) {
    nodes.push(node);
    if (node.subgraph) workflowNodes(node.subgraph, visited, nodes);
  }
  return nodes;
}

function issue(role, scope, matches, expectedType) {
  if (!matches.length) {
    return `Re-shoot binding unavailable: expected one “${role}” node ${scope}, found none.`;
  }
  if (matches.length > 1) {
    return `Re-shoot binding unavailable: expected one “${role}” node ${scope}, found ${matches.length}.`;
  }
  if (expectedType && matches[0].type !== expectedType) {
    return `Re-shoot binding unavailable: “${role}” ${scope} must be ${expectedType}, found ${matches[0].type ?? "an unknown type"}.`;
  }
  return "";
}

export function resolveUniqueRole(nodes, role, {
  scope = "in the selected scope",
  expectedType,
} = {}) {
  const matches = roleNodes(nodes, role);
  const error = issue(role, scope, matches, expectedType);
  return { node: error ? null : matches[0], error, matches };
}

export function reshootHostIsolationError(host) {
  const rootGraph = host.rootGraph ?? host.graph?.rootGraph ?? host.graph;
  const sharedDefinitionHosts = workflowNodes(rootGraph).filter((node) =>
    node.properties?.app_view_renderer === host.properties?.app_view_renderer &&
    node.type === host.type
  );
  return sharedDefinitionHosts.length > 1
    ? `Re-shoot binding unavailable: ${sharedDefinitionHosts.length} App hosts use the same subgraph definition. ` +
      "Duplicate the subgraph definition so each App has its own inner nodes and values, then reload the workflow."
    : "";
}

export function resolveRequiredReshootBindings(host) {
  const isolationError = reshootHostIsolationError(host);
  if (isolationError) throw new Error(isolationError);
  const resolved = {};
  const errors = [];
  for (const [name, role, expectedType] of REQUIRED_INNER_BINDINGS) {
    const result = resolveUniqueRole(host.subgraph?.nodes, role, {
      scope: "inside this subgraph",
      expectedType,
    });
    if (result.error) errors.push(result.error);
    else resolved[name] = result.node;
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return resolved;
}

function graphLink(graph, id) {
  const link = graph?.getLink?.(id) ?? graph?.links?.get?.(id) ?? graph?.links?.[id];
  if (!Array.isArray(link)) return link;
  return { target_id: link[3] };
}

function graphNode(graph, id) {
  return graph?.getNodeById?.(id) ?? graph?.nodes?.find((node) => node.id === id);
}

export function resolveReshootSaveBinding(host, role, outputName) {
  const candidates = roleNodes(host.subgraph?.nodes, role)
    .map((node) => ({ node, location: "inside this subgraph" }));
  const seen = new Set(candidates.map(({ node }) => node));
  const outputs = (host.outputs ?? []).map((output, slot) => ({ output, slot }))
    .filter(({ output }) => output.name === outputName);
  if (outputs.length !== 1) {
    return {
      node: null,
      location: null,
      error: `Re-shoot binding unavailable: expected one “${outputName}” host output, found ${outputs.length}.`,
      matches: candidates.map(({ node }) => node),
    };
  }
  for (const id of outputs[0].output.links ?? []) {
    const link = graphLink(host.graph, id);
    const node = link && graphNode(host.graph, link.target_id);
    if (node?.type !== "SaveVideo" || node.properties?.reshoot_role !== role || seen.has(node)) continue;
    seen.add(node);
    candidates.push({ node, location: `connected to output “${outputName}”` });
  }
  const matches = candidates.map(({ node }) => node);
  const scope = `inside this subgraph or directly connected to output “${outputName}”`;
  const error = issue(role, scope, matches, "SaveVideo");
  return {
    node: error ? null : candidates[0].node,
    location: error ? null : candidates[0].location,
    error,
    matches,
  };
}
