export function readKeys(raw) {
  const keys = JSON.parse(raw || '[]');
  if (!Array.isArray(keys) || keys.some(k => !Number.isInteger(k.f) || k.f < 1)) {
    throw new Error('Keyframes must be a list with positive frame numbers.');
  }
  return keys.slice().sort((a, b) => a.f - b.f);
}

export function createTimeline({ camera, widget, setWidget, onSeek, onPlay, sourceFrames }) {
  const root = document.createElement('section');
  root.className = 'reshoot-timeline';
  root.innerHTML = `<h3>Camera keyframes</h3><div class="reshoot-timeline__transport">
    <button type="button" data-action="play" aria-label="Play preview">▶</button>
    <input type="range" min="1" max="1" step="1" aria-label="Preview frame">
    <output></output><button type="button" data-action="key">◇ Key</button></div>
    <div class="reshoot-timeline__markers" aria-label="Camera keyframes"></div>
    <div class="reshoot-timeline__tools"><label>Motion <select aria-label="Motion interpolation"></select></label>
    <button type="button" data-action="clear">Clear keys</button>
    <button type="button" data-action="undo" hidden>Undo clear</button></div>
    <p class="reshoot-message" role="status"></p>`;
  const range = root.querySelector('input');
  const output = root.querySelector('output');
  const markers = root.querySelector('.reshoot-timeline__markers');
  root.querySelector('.reshoot-timeline__transport').append(markers);
  const select = root.querySelector('select');
  const key = root.querySelector('[data-action="key"]');
  const play = root.querySelector('[data-action="play"]');
  const clear = root.querySelector('[data-action="clear"]');
  const undo = root.querySelector('[data-action="undo"]');
  const message = root.querySelector('[role="status"]');
  const motion = widget(camera, 'interp_motion');
  const choices = typeof motion?.options?.values === 'function' ? motion.options.values() : motion?.options?.values ?? ['linear', 'smooth'];
  for (const value of choices) {
    const option = new Option(value === 'smooth' ? 'Smooth spline' : value.replaceAll('_', ' '), value);
    select.add(option);
  }
  let lastKeys, removed;
  function count() { return Math.max(1, sourceFrames()); }
  function frame() { return Math.min(count(), Math.max(1, Number(widget(camera, 'frame_index')?.value ?? 1))); }
  function seek(value) {
    camera._crossviewPreview && (camera._crossviewPreview.auditioning = false);
    setWidget(camera, 'frame_index', Math.round(value));
    onSeek();
    sync();
  }
  function write(keys) {
    if (camera.inputs?.find(i => i.name === 'keyframes')?.link != null) return;
    const ed = camera._crossviewPreview;
    if (ed) ed.writeKfs(keys);
    else setWidget(camera, 'keyframes', JSON.stringify(keys));
    setWidget(camera, 'use_keyframes', keys.length > 0);
    camera.graph?.incrementVersion?.();
    sync();
  }
  range.addEventListener('input', () => seek(Number(range.value)));
  play.addEventListener('click', () => onPlay());
  key.addEventListener('click', () => {
    const keys = readKeys(widget(camera, 'keyframes')?.value);
    const f = frame();
    const index = keys.findIndex(k => k.f === f);
    if (index >= 0) keys.splice(index, 1);
    else {
      const ed = camera._crossviewPreview;
      // Between keys, use the pose actually returned by the preview server.
      const pose = !ed?.auditioning && ed?.keying() && ed?.pivot?.pose
        ? ed.pivot.pose : ed?.poseNow() ?? {
          az: widget(camera, 'azimuth')?.value, el: widget(camera, 'elevation')?.value,
          dist: widget(camera, 'distance')?.value,
        };
      keys.push({f, ...pose});
    }
    if (camera._crossviewPreview) camera._crossviewPreview.auditioning = false;
    write(keys);
  });
  select.addEventListener('change', () => setWidget(camera, 'interp_motion', select.value));
  clear.addEventListener('click', () => {
    removed = { raw: widget(camera, 'keyframes')?.value, enabled: widget(camera, 'use_keyframes')?.value };
    write([]);
    undo.hidden = false;
  });
  undo.addEventListener('click', () => {
    if (!removed) return;
    setWidget(camera, 'keyframes', removed.raw);
    setWidget(camera, 'use_keyframes', removed.enabled);
    removed = null;
    undo.hidden = true;
    sync();
  });
  function sync() {
    const f = frame(), n = count();
    range.max = String(n);
    range.value = String(f);
    output.textContent = `${((f - 1) / 24).toFixed(1)} / ${((n - 1) / 24).toFixed(1)} s`;
    output.title = `Frame ${f} of ${n} at 24 fps`;
    select.value = String(motion?.value ?? 'linear');
    const raw = widget(camera, 'keyframes')?.value ?? '';
    const wired = camera.inputs?.find(i => i.name === 'keyframes')?.link != null;
    clear.disabled = wired;
    undo.disabled = wired;
    let keys;
    try { keys = readKeys(raw); message.textContent = ''; }
    catch {
      message.textContent = 'Invalid keyframes. Correct the node’s keyframes field or clear the keys.';
      key.disabled = true; lastKeys = null; markers.replaceChildren(); return;
    }
    key.disabled = wired || n <= 1;
    clear.disabled = wired || keys.length === 0;
    if (wired) message.textContent = 'Keyframes are supplied by a connected node.';
    const selected = keys.some(k => k.f === f);
    key.textContent = selected ? '◆ Remove key' : '◇ Key';
    key.setAttribute('aria-label', selected ? 'Remove keyframe' : 'Add keyframe');
    if (raw !== lastKeys || markers.dataset.count !== String(n)) {
      lastKeys = raw; markers.dataset.count = String(n); markers.replaceChildren();
      for (const k of keys) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = '◆';
        button.style.left = `${Math.min(100, (k.f - 1) / Math.max(1, n - 1) * 100)}%`;
        button.setAttribute('aria-label', `Keyframe ${k.f}`);
        button.title = `Frame ${k.f} · ${k.az}° / ${k.el}°`;
        button.dataset.frame = String(k.f);
        let drag;
        button.addEventListener('pointerdown', event => {
          if (camera.inputs?.find(i => i.name === 'keyframes')?.link != null || event.button !== 0) return;
          event.stopPropagation(); button.setPointerCapture(event.pointerId);
          drag = {x:event.clientX, frame:k.f, moved:false};
        });
        button.addEventListener('pointermove', event => {
          if (!drag) return;
          event.stopPropagation();
          if (Math.abs(event.clientX-drag.x)<3 && !drag.moved) return;
          drag.moved = true;
          const rect = markers.getBoundingClientRect();
          drag.frame = Math.max(1,Math.min(n,Math.round((event.clientX-rect.left)/rect.width*(n-1))+1));
          button.style.left = `${(drag.frame-1)/Math.max(1,n-1)*100}%`;
        });
        button.addEventListener('pointerup', event => {
          if (!drag) return;
          event.stopPropagation();
          const move=drag; drag=null;
          if (!move.moved) {seek(Math.min(n,k.f)); return;}
          const current=readKeys(widget(camera,'keyframes')?.value);
          if(current.some(other=>other.f===move.frame && other.f!==k.f)) {
            lastKeys = null; sync(); message.textContent='There is already a key at that frame.'; return;
          }
          const target=current.find(other=>other.f===k.f);
          if(target) target.f=move.frame;
          write(current); seek(move.frame);
        });
        button.addEventListener('pointercancel',()=>{drag=null;lastKeys=null;sync();});
        button.addEventListener('click', event => {if(event.detail===0) seek(Math.min(n,k.f));});
        markers.append(button);
      }
    }
    for (const marker of markers.children) marker.setAttribute('aria-pressed', String(Number(marker.dataset.frame) === f));
    if (keys.some(k => k.f > n)) message.textContent = 'Some keys are past the clip end. Adjust them in the node or clear the keys.';
  }
  sync();
  return {root, sync, seek, setPlaying(value) {
    play.textContent = value ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', value ? 'Pause preview' : 'Play preview');
  }};
}
