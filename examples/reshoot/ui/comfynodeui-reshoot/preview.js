import { createTimeline } from './timeline.js';

export function createPreviewPanel({host, camera, source, prepare, api, widget, setWidget, executionId, sourceUrl}) {
  const root = document.createElement('section');
  root.className = 'reshoot-workspace';
  root.innerHTML = `<h3>Camera preview</h3><div class="reshoot-preview-modes">
    <button type="button" data-view="warp" aria-pressed="true">Warp preview</button>
    <button type="button" data-view="source" aria-pressed="false">Source</button></div>
    <div class="reshoot-preview-stage"><img alt="Warp preview" hidden><video muted playsinline hidden></video>
    <p class="reshoot-preview-status" role="status">Run the workflow once to prepare the scene.</p></div>`;
  const stage = root.querySelector('.reshoot-preview-stage');
  const img = root.querySelector('img'), video = root.querySelector('video');
  const status = root.querySelector('[role="status"]');
  let active = false, view = 'warp', playing = false, disposed = false;
  let inflight = false, shown = '', objectUrl, aborter, timer, drag, metadataCount = 1;
  const fingerprint = () => JSON.stringify([widget(source,'file')?.value, widget(prepare,'duration')?.value, widget(prepare,'aspect_ratio')?.value, widget(prepare,'megapixels')?.value]);
  let cachedFor = host.properties.reshoot_preview_source ?? null;
  function count() {
    if (cachedFor === fingerprint() && camera._crossviewClipFrames > 0) return camera._crossviewClipFrames;
    return metadataCount;
  }
  function frame() { return Math.max(1, Math.min(count(), Number(widget(camera,'frame_index')?.value ?? 1))); }
  function updateMetadata() {
    const available = Math.floor(video.duration * 24);
    const requested = Math.round(Number(widget(prepare,'duration')?.value ?? 5) * 24);
    const rounded = requested + ((5 - requested % 17) + 17) % 17;
    const n = Math.min(rounded, available);
    metadataCount = Number.isFinite(n) && n >= 5 ? n - (n - 5) % 17 : 1;
  }
  const timeline = createTimeline({camera, widget, setWidget, sourceFrames:count, onSeek:() => { stop(); sync(); }, onPlay:() => {
    if (playing) stop(); else { playing = true; timeline.setPlaying(true); shown = ''; sync(); }
  }});
  root.append(timeline.root);
  function stop() { playing = false; clearTimeout(timer); timer = null; timeline.setPlaying(false); video.pause(); }
  const params = () => camera._crossviewPreview?.params() ?? {};
  async function request() {
    if (!active || disposed || inflight || view !== 'warp') return;
    if (cachedFor !== fingerprint()) {
      img.hidden = true; status.hidden = false;
      status.textContent = 'Run the workflow with ComfyUI’s Run button to prepare this clip.';
      stop(); return;
    }
    const payload = {node_id:executionId(camera), frame:frame(), iso:false, params:params()};
    const requestedSource = fingerprint();
    const stillCurrent = () => !disposed && active && view === 'warp' && fingerprint() === requestedSource;
    const sig = JSON.stringify(payload);
    if (sig === shown && !playing) return;
    inflight = true;
    aborter = new AbortController();
    try {
      const response = await api.fetchApi(camera._crossviewPreview?.endpoint ?? '/crossview_preview/render', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:aborter.signal,
      });
      if (!stillCurrent()) return;
      if (!response.ok) {
        stop(); img.hidden = true; status.hidden = false;
        status.textContent = response.status === 409 ? 'Preview cache is empty. Run the workflow again.' : `Preview failed (${response.status}). Run the workflow again.`;
        shown = sig; return;
      }
      const info = JSON.parse(response.headers.get('X-Preview-Info') ?? 'null');
      if (info && camera._crossviewPreview) {
        camera._crossviewPreview.setCount(info.count);
        camera._crossviewPreview.pivot = info.pivot;
      }
      const nextUrl = URL.createObjectURL(await response.blob());
      if (!stillCurrent()) { URL.revokeObjectURL(nextUrl); return; }
      const previousUrl = objectUrl; objectUrl = nextUrl; img.src = nextUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      img.hidden = false; status.hidden = true; shown = sig;
      if (playing) timer = setTimeout(() => {
        setWidget(camera,'frame_index',frame() >= count() ? 1 : frame() + 1);
        timeline.sync(); request();
      }, 1000 / 24);
    } catch (error) {
      if (error.name !== 'AbortError' && stillCurrent()) { status.hidden = false; status.textContent = `Preview unavailable: ${error.message}`; stop(); shown = sig; }
    } finally { inflight = false; }
  }
  stage.addEventListener('pointerdown', event => {
    if (view !== 'warp' || img.hidden || event.button !== 0) return;
    event.stopPropagation(); stage.setPointerCapture(event.pointerId); stop();
    camera._crossviewPreview?.beginAudition();
    drag = {x:event.clientX,y:event.clientY,az:Number(widget(camera,'azimuth')?.value),el:Number(widget(camera,'elevation')?.value)};
  });
  stage.addEventListener('pointermove', event => {
    if (!drag) return;
    event.stopPropagation();
    const scale = stage.getBoundingClientRect().width / stage.offsetWidth || 1;
    setWidget(camera,'azimuth',Math.max(-180,Math.min(180,drag.az + (event.clientX-drag.x) / scale * .35)));
    setWidget(camera,'elevation',Math.max(-89,Math.min(89,drag.el - (event.clientY-drag.y) / scale * .35)));
    request();
  });
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('pointercancel', () => { drag = null; });
  stage.addEventListener('wheel', event => {
    if (view !== 'warp') return;
    event.preventDefault(); event.stopPropagation(); camera._crossviewPreview?.beginAudition();
    setWidget(camera,'distance',Math.max(.1,Math.min(10,Number(widget(camera,'distance')?.value) * (event.deltaY > 0 ? 1.05 : 1/1.05))));
    request();
  }, {passive:false});
  for (const button of root.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
    stop(); view = button.dataset.view;
    for (const b of root.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed',String(b===button));
    img.hidden = view !== 'warp'; video.hidden = view !== 'source'; status.hidden = view === 'source'; shown = ''; sync();
  });
  video.addEventListener('loadedmetadata', () => { updateMetadata(); timeline.sync(); });
  video.addEventListener('error', () => {
    if (view === 'source') { status.hidden = false; status.textContent = 'Choose an available source video.'; }
  });
  const onExecuted = ({detail}) => {
    if (String(detail.node ?? detail.display_node) !== executionId(camera)) return;
    if (!detail.output?.crossview_preview) return;
    cachedFor = fingerprint(); host.properties.reshoot_preview_source = cachedFor;
    shown = ''; request();
  };
  api.addEventListener('executed',onExecuted);
  function sync() {
    const url = sourceUrl();
    if (video.dataset.source !== url) { video.dataset.source = url; video.src = url; metadataCount = 1; stop(); }
    updateMetadata(); timeline.sync();
    if (!active) return;
    if (view === 'source') {
      const t = (frame()-1)/24;
      if (Number.isFinite(video.duration) && Math.abs(video.currentTime-t) > .025) video.currentTime = t;
      if (playing && !timer) timer = setTimeout(() => {
        timer = null; setWidget(camera,'frame_index',frame() >= count() ? 1 : frame()+1); sync();
      }, 1000/24);
    } else request();
  }
  return {root, sync, setActive(value) {active = value; if (!active) {stop(); aborter?.abort();} else sync();},
    dispose() {disposed = true; stop(); aborter?.abort(); api.removeEventListener('executed',onExecuted); if(objectUrl) URL.revokeObjectURL(objectUrl); video.removeAttribute('src'); video.load();}};
}
