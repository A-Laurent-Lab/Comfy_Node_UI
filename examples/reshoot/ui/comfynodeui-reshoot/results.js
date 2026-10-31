import { resolveReshootSaveBinding } from './bindings.js';

export function createResultsPanel({host, app, api, executionId}) {
  const root = document.createElement('section');
  root.className = 'reshoot-workspace';
  root.innerHTML = `<h3>Output video</h3><div class="reshoot-output-options"></div>
    <div class="reshoot-binding-errors" role="alert" hidden></div>
    <video controls playsinline hidden aria-label="Output video"></video>
    <p class="reshoot-message" role="status">Run the workflow to generate a result.</p>
    <a class="reshoot-download" hidden>Download video</a>`;
  const options = root.querySelector('.reshoot-output-options'), video = root.querySelector('video');
  const bindingErrors = root.querySelector('.reshoot-binding-errors');
  const status = root.querySelector('[role="status"]'), download = root.querySelector('a');
  const roles = [
    ['generated-save','Generated','Generated'],
    ['warp-save','Warp guide','Warp guide'],
    ['original-audio-save','Original audio','Original audio'],
  ];
  let selected = 'generated-save', currentUrl = '', active = false;
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
    const bindings = new Map();
    const errors = [];
    for (const [role,,outputName] of roles) {
      const binding = resolveReshootSaveBinding(host,role,outputName);
      bindings.set(role,binding);
      if (binding.error) errors.push(binding.error);
      const node = binding.node;
      if (node) {
        const id = node.graph === app.graph ? String(node.id) : `${node.graph?.id}:${node.id}`;
        record(role,app.nodeOutputs?.[id]);
      }
      buttons.get(role).disabled = Boolean(binding.error) || !saved[role];
      buttons.get(role).title = binding.error;
      buttons.get(role).setAttribute('aria-pressed',String(role===selected));
    }
    bindingErrors.textContent = errors.join(' ');
    bindingErrors.hidden = !errors.length;
    const bindingError = bindings.get(selected)?.error;
    const file = saved[selected];
    const url = !bindingError && file ? api.apiURL(`/view?${new URLSearchParams(file)}`) : '';
    if (url !== currentUrl) {
      currentUrl = url; video.pause();
      if (url) video.src = url; else video.removeAttribute('src');
      download.href = url; download.download = file?.filename ?? '';
    }
    video.hidden = !url; status.hidden = Boolean(url); download.hidden = !url;
    if (!url) status.textContent = bindingError || 'Run the workflow to generate a result.';
  }
  const onExecuted = ({detail}) => {
    for (const [role,,outputName] of roles) {
      const node = resolveReshootSaveBinding(host,role,outputName).node;
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
