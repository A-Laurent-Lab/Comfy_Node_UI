export function createResultsPanel({host, app, api, executionId}) {
  const root = document.createElement('section');
  root.className = 'reshoot-workspace';
  root.innerHTML = `<h3>Output video</h3><div class="reshoot-output-options"></div>
    <video controls playsinline hidden aria-label="Output video"></video>
    <p class="reshoot-message" role="status">Run the workflow to generate a result.</p>
    <a class="reshoot-download" hidden>Download video</a>`;
  const options = root.querySelector('.reshoot-output-options'), video = root.querySelector('video');
  const status = root.querySelector('[role="status"]'), download = root.querySelector('a');
  const roles = [
    ['generated-save','Generated',0], ['warp-save','Warp guide',1], ['original-audio-save','Original audio',2],
  ];
  let selected = 'generated-save', currentUrl = '', active = false;
  function findNode(role, slot) {
    const inner = host.subgraph?.nodes?.find(n => n.properties?.reshoot_role === role);
    if (inner) return inner;
    for (const id of host.outputs?.[slot]?.links ?? []) {
      const link = host.graph?.getLink?.(id) ?? host.graph?.links?.get?.(id) ?? host.graph?.links?.[id];
      const node = link && host.graph?.getNodeById?.(link.target_id);
      if (node?.type === 'SaveVideo') return node;
    }
  }
  const saved = host.properties.reshoot_results ?? {};
  const buttons = new Map();
  for (const [role,label] of roles) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => {selected = role; sync();});
    buttons.set(role,button); options.append(button);
  }
  function record(role, output) {
    const file = output?.images?.find(file => file.type === 'output' && /\.(mp4|webm|mkv)$/i.test(file.filename));
    if (!file) return;
    const descriptor = {filename:file.filename, subfolder:file.subfolder ?? '', type:file.type};
    saved[role] = descriptor;
    host.properties.reshoot_results = saved;
  }
  function sync() {
    for (const [role,,slot] of roles) {
      const node = findNode(role,slot);
      if (node) {
        const id = node.graph === app.graph ? String(node.id) : `${node.graph?.id}:${node.id}`;
        record(role,app.nodeOutputs?.[id]);
      }
      buttons.get(role).disabled = !saved[role];
      buttons.get(role).setAttribute('aria-pressed',String(role===selected));
    }
    const file = saved[selected];
    const url = file ? api.apiURL(`/view?${new URLSearchParams(file)}`) : '';
    if (url !== currentUrl) {
      currentUrl = url; video.pause();
      if (url) video.src = url; else video.removeAttribute('src');
      video.hidden = !url; status.hidden = Boolean(url); download.hidden = !url;
      download.href = url; download.download = file?.filename ?? '';
    }
  }
  const onExecuted = ({detail}) => {
    for (const [role,,slot] of roles) {
      const node = findNode(role,slot);
      if (node && String(detail.display_node ?? detail.node) === executionId(node)) record(role,detail.output);
    }
    sync();
  };
  api.addEventListener('executed',onExecuted);
  video.addEventListener('error', () => {
    status.hidden = false; status.textContent = 'This output file is unavailable. Run the workflow again to create it.';
  });
  sync();
  return {root, sync, setActive(value) {active=value; if(!active) video.pause(); else sync();},
    dispose() {video.pause(); video.removeAttribute('src'); video.load(); api.removeEventListener('executed',onExecuted);}};
}
