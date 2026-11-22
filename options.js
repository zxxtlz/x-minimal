(function () {
  'use strict';
  const host = document.getElementById('root');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = XM.PANEL_CSS;
  const overlay = document.createElement('div'); overlay.className = 'overlay';
  overlay.style.background = 'transparent';
  const panel = document.createElement('div'); panel.className = 'panel';
  overlay.appendChild(panel); shadow.appendChild(style); shadow.appendChild(overlay);
  XM.renderPanel(panel, {});
  browser.storage.onChanged.addListener(() => XM.renderPanel(panel, {}));
})();
