// Shared presentation only. A renderer supplies the always-visible controls
// and named work areas; graph bindings and media stay in the UI package.
export function createAppViewShell({ host, view, onChange }) {
  const root = document.createElement('div');
  root.className = 'comfy-app-shell';
  const primary = document.createElement('div');
  primary.className = 'comfy-app-shell__primary';
  primary.append(view.root);
  root.append(primary);
  const panels = view.panels ?? [];
  const detail = document.createElement('div');
  detail.className = 'comfy-app-shell__detail';
  const nav = document.createElement('nav');
  nav.className = 'comfy-app-shell__nav';
  nav.setAttribute('aria-label', 'App sections');
  const buttons = new Map();
  for (const panel of panels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = panel.label;
    button.dataset.appSection = panel.id;
    button.addEventListener('click', () => {
      host.properties.app_view_section = panel.id;
      update();
      host.graph?.incrementVersion?.();
      onChange();
    });
    buttons.set(panel.id, button);
    nav.append(button);
    panel.element.classList.add('comfy-app-shell__section');
  }
  if (panels.length) {
    detail.append(nav, ...panels.map(panel => panel.element));
    root.append(detail);
  }
  let active = false;
  function update() {
    const expanded = host.properties.app_view_layout === 'expanded' && panels.length > 0;
    const current = panels.find(panel => panel.id === host.properties.app_view_section) ?? panels[0];
    root.dataset.layout = expanded ? 'expanded' : 'compact';
    detail.hidden = !expanded;
    for (const panel of panels) {
      panel.element.hidden = panel !== current;
      buttons.get(panel.id).setAttribute('aria-current', panel === current ? 'page' : 'false');
    }
    view.onPanelChange?.(active && expanded ? current?.id : null);
  }
  update();
  return {
    root, hasPanels: panels.length > 0, update,
    setActive(value) { active = value; update(); },
  };
}
