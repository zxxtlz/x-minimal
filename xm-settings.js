/* X minimal: settings schema, storage helpers and the options panel (shared by the in-page panel and options.html) */
(function (global) {
  'use strict';
  const api = typeof browser !== 'undefined' ? browser : chrome;

  const DEFAULTS = {
    gradientAnimation: true,
    showRightSidebar: false,
    showFloatingChat: false,
    showFloatingGrok: false,
    sidebarHome: true,
    sidebarExplore: true,
    sidebarNotifications: true,
    sidebarMessages: true,
    sidebarGrok: true,
    sidebarBookmarks: true,
    sidebarCommunities: true,
    sidebarLists: true,
    sidebarPremium: true,
    sidebarProfile: true,
    sidebarCreatorStudio: true,
    sidebarCalls: true,
    sidebarMore: true,
    bounce: true,
    keyboardShortcuts: true,
    showKeyHints: true,
    playSelectedVideo: true,
    pauseOutOfView: true,
    gifsAsVideos: true,
    copyLinksAs: '',          // '' = leave X's own link alone
    customCopyDomain: '',
    nativeVideo: true,
    videoQuality: 0           // 0 = best
  };

  const COPY_DOMAINS = ['fxtwitter.com', 'vxtwitter.com', 'fixupx.com', 'nitter.net', 'twitter.com', 'x.com'];

  const SCHEMA = [
    { title: 'appearance', items: [
      { key: 'gradientAnimation', type: 'bool', label: 'animate the background gradient' },
      { key: 'showRightSidebar', type: 'bool', label: 'show the right sidebar (search, trends, who to follow)' }
    ] },
    { title: 'sidebar buttons', items: [
      { key: 'sidebarHome', type: 'bool', label: 'home' },
      { key: 'sidebarExplore', type: 'bool', label: 'explore / search' },
      { key: 'sidebarNotifications', type: 'bool', label: 'notifications' },
      { key: 'sidebarMessages', type: 'bool', label: 'messages' },
      { key: 'sidebarGrok', type: 'bool', label: 'grok' },
      { key: 'sidebarBookmarks', type: 'bool', label: 'bookmarks' },
      { key: 'sidebarCommunities', type: 'bool', label: 'communities' },
      { key: 'sidebarLists', type: 'bool', label: 'lists' },
      { key: 'sidebarPremium', type: 'bool', label: 'premium' },
      { key: 'sidebarProfile', type: 'bool', label: 'profile' },
      { key: 'sidebarCreatorStudio', type: 'bool', label: 'creator studio' },
      { key: 'sidebarCalls', type: 'bool', label: 'calls' },
      { key: 'sidebarMore', type: 'bool', label: 'more' }
    ] },
    { title: 'floating buttons', items: [
      { key: 'showFloatingChat', type: 'bool', label: 'show the floating chat button' },
      { key: 'showFloatingGrok', type: 'bool', label: 'show the floating grok button' }
    ] },
    { title: 'keyboard', items: [
      { key: 'keyboardShortcuts', type: 'bool', label: 'keyboard shortcuts: w / s select a post, space plays its video, l like, b keep, t repost, r reply, enter open, / search, n write' },
      { key: 'showKeyHints', type: 'bool', label: 'show the shortcut keys in the sidebar' },
      { key: 'playSelectedVideo', type: 'bool', label: "play a post's video as soon as you select it with w / s" }
    ] },
    { title: 'posts', items: [
      { key: 'bounce', type: 'bool', label: 'bounce when you like, repost or keep a post' },
      { key: 'copyLinksAs', type: 'select', label: 'copy post links as',
        options: [['', 'default (x.com)']].concat(COPY_DOMAINS.map((d) => [d, d])).concat([['custom', 'custom...']]) },
      { key: 'customCopyDomain', type: 'text', label: 'custom domain', placeholder: 'e.g. fxtwitter.com', showWhen: ['copyLinksAs', 'custom'] },
      { key: 'guideImage', type: 'image', src: 'guide.png', label: 'guide', alt: 'x minimal options and shortcuts guide' }
    ] },
    { title: 'videos', items: [
      { key: 'nativeVideo', type: 'bool', label: "use the browser's own video player (right-click, open in new tab)" },
      { key: 'gifsAsVideos', type: 'bool', label: 'show gifs as videos (with video controls)' },
      { key: 'pauseOutOfView', type: 'bool', label: 'pause videos when they scroll out of view' },
      { key: 'videoQuality', type: 'select', number: true, label: 'preferred quality',
        options: [[0, 'best available'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p']] }
    ] }
  ];

  function load() { return api.storage.local.get(DEFAULTS).then((s) => Object.assign({}, DEFAULTS, s)); }
  function save(key, value) { return api.storage.local.set({ [key]: value }); }

  function cleanDomain(d) {
    d = String(d || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
  }
  function copyDomain(s) {
    if (!s.copyLinksAs) return '';
    return s.copyLinksAs === 'custom' ? cleanDomain(s.customCopyDomain) : cleanDomain(s.copyLinksAs);
  }

  /* guide image: a small preview in the panel, an enlarged view on click */
  let guideLightbox = null;
  let guideKey = null;
  function closeGuideLightbox() {
    if (guideLightbox) { guideLightbox.remove(); guideLightbox = null; }
    if (guideKey) { document.removeEventListener('keydown', guideKey, true); guideKey = null; }
    if (document.documentElement) document.documentElement.removeAttribute('data-xm-guide-lightbox');
  }
  function openGuideLightbox(host, src, alt) {
    closeGuideLightbox();
    const parent = host.getRootNode() || document;
    const box = document.createElement('div');
    box.className = 'guide-lightbox';
    const img = document.createElement('img'); img.src = src; img.alt = alt || 'guide';
    img.addEventListener('click', (e) => e.stopPropagation());
    const hint = document.createElement('div'); hint.className = 'guide-lightbox-hint';
    hint.textContent = 'click anywhere or press esc to close';
    box.append(img, hint);
    box.addEventListener('click', closeGuideLightbox);
    parent.appendChild(box);
    if (document.documentElement) document.documentElement.setAttribute('data-xm-guide-lightbox', '1');
    guideKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeGuideLightbox(); }
    };
    document.addEventListener('keydown', guideKey, true);
    guideLightbox = box;
  }

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Geist", "Inter", "Segoe UI Variable Text", system-ui, sans-serif; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .panel { width: min(520px, 100%); max-height: min(720px, 100%); overflow: auto; background: #0a0a0a; color: #e6e6e6; border: 1px solid #1f1f1f; border-radius: 14px; padding: 20px 22px 22px; box-shadow: 0 20px 60px rgba(0,0,0,.7); scrollbar-width: thin; scrollbar-color: #2a2a2a transparent; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .head h1 { margin: 0; font-size: 15px; font-weight: 600; text-transform: lowercase; }
    .head button { background: none; border: 1px solid #2c2c2c; color: #bbb; border-radius: 8px; padding: 4px 10px; font-size: 12px; cursor: pointer; text-transform: lowercase; }
    .head button:hover { color: #fff; border-color: #444; }
    h2 { margin: 18px 0 6px; font-size: 11px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: #6f6f6f; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 8px 0; border-top: 1px solid #141414; font-size: 13px; text-transform: lowercase; }
    .row:first-of-type { border-top: 0; }
    .row label { flex: 1; cursor: pointer; }
    .row input[type=checkbox] { appearance: none; width: 34px; height: 20px; border-radius: 20px; background: #222; position: relative; cursor: pointer; flex: none; transition: background .15s; }
    .row input[type=checkbox]::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #888; transition: transform .15s, background .15s; }
    .row input[type=checkbox]:checked { background: #e6e6e6; }
    .row input[type=checkbox]:checked::after { transform: translateX(14px); background: #000; }
    select, input[type=text] { background: #111; color: #e6e6e6; border: 1px solid #2c2c2c; border-radius: 8px; padding: 6px 8px; font-size: 12.5px; min-width: 160px; }
    select:focus, input[type=text]:focus { outline: none; border-color: #555; }
    .hint { margin-top: 16px; font-size: 11.5px; color: #666; line-height: 1.5; text-transform: lowercase; }
    .guide { padding: 10px 0 2px; border-top: 1px solid #141414; text-align: center; }
    .guide-label { font-size: 11.5px; color: #666; text-transform: lowercase; margin-bottom: 8px; }
    .guide-label::after { content: "  \u00b7  click to enlarge"; color: #4f4f4f; }
    .guide img { display: block; width: min(240px, 62%); height: auto; margin: 0 auto; border: 1px solid #2c2c2c;
      border-radius: 8px; cursor: zoom-in; transition: filter .2s ease, box-shadow .2s ease, transform .2s ease; }
    .guide img:hover { filter: brightness(.62); box-shadow: 0 8px 24px rgba(0,0,0,.65); animation: xm-guide-bounce .5s ease; }
    @keyframes xm-guide-bounce { 0% { transform: scale(1); } 35% { transform: scale(.93); } 70% { transform: scale(1.03); } 100% { transform: scale(1); } }
    .guide-lightbox { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.95); display: flex;
      flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; cursor: zoom-out; }
    .guide-lightbox img { max-width: 100%; max-height: calc(100vh - 76px); width: auto; height: auto; object-fit: contain;
      border-radius: 4px; box-shadow: 0 12px 60px rgba(0,0,0,.85); cursor: default; }
    .guide-lightbox-hint { font-size: 11.5px; color: #777; text-transform: lowercase; }
    @media (max-width: 620px) {
      .overlay { padding: 8px; }
      .panel { max-height: 100%; border-radius: 8px; padding: 14px; }
      .row { gap: 8px; font-size: 12px; flex-wrap: wrap; }
      .row label { flex: 1 1 100%; }
      select, input[type=text] { min-width: 0; width: 100%; }
      .guide img { width: min(200px, 70%); }
      .guide-lightbox { padding: 10px; }
    }
  `;

  function renderPanel(container, opts) {
    opts = opts || {};
    container.textContent = '';
    const head = document.createElement('div'); head.className = 'head';
    const h1 = document.createElement('h1'); h1.textContent = 'x minimal \u00B7 options';
    head.appendChild(h1);
    if (opts.onClose) {
      const close = document.createElement('button'); close.textContent = 'close';
      close.addEventListener('click', opts.onClose); head.appendChild(close);
    }
    container.appendChild(head);

    return load().then((state) => {
      const rows = {};
      const refresh = () => {
        for (const k in rows) {
          const r = rows[k];
          if (r.showWhen) r.el.style.display = state[r.showWhen[0]] === r.showWhen[1] ? '' : 'none';
        }
      };
      for (const section of SCHEMA) {
        const h2 = document.createElement('h2'); h2.textContent = section.title; container.appendChild(h2);
        for (const item of section.items) {
          if (item.type === 'image') {
            const wrap = document.createElement('div'); wrap.className = 'guide';
            if (item.label) {
              const cap = document.createElement('div'); cap.className = 'guide-label'; cap.textContent = item.label;
              wrap.appendChild(cap);
            }
            const img = document.createElement('img');
            img.src = api.runtime.getURL(item.src);
            img.alt = item.alt || item.label || 'guide';
            img.addEventListener('click', () => openGuideLightbox(container, img.src, img.alt));
            wrap.appendChild(img);
            container.appendChild(wrap);
            continue;
          }
          const row = document.createElement('div'); row.className = 'row';
          const id = 'xm-' + item.key;
          const label = document.createElement('label'); label.textContent = item.label; label.htmlFor = id;
          let input;
          if (item.type === 'bool') {
            input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!state[item.key];
            input.addEventListener('change', () => { state[item.key] = input.checked; save(item.key, input.checked); refresh(); });
          } else if (item.type === 'select') {
            input = document.createElement('select');
            for (const [value, text] of item.options) {
              const o = document.createElement('option'); o.value = String(value); o.textContent = text; input.appendChild(o);
            }
            input.value = String(state[item.key]);
            input.addEventListener('change', () => {
              const v = item.number ? Number(input.value) : input.value;
              state[item.key] = v; save(item.key, v); refresh();
            });
          } else {
            input = document.createElement('input'); input.type = 'text'; input.value = state[item.key] || '';
            input.placeholder = item.placeholder || ''; input.spellcheck = false; input.autocomplete = 'off';
            const check = () => { input.style.borderColor = (!input.value.trim() || cleanDomain(input.value)) ? '' : '#7a2b2b'; };
            input.addEventListener('input', () => { // saved as you type; only a valid domain is stored
              const v = cleanDomain(input.value);
              state[item.key] = v; save(item.key, v); check();
            });
            input.addEventListener('change', () => { const v = cleanDomain(input.value); if (v) input.value = v; check(); });
            check();
          }
          input.id = id;
          row.appendChild(label); row.appendChild(input);
          container.appendChild(row);
          rows[item.key] = { el: row, showWhen: item.showWhen };
        }
      }
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.textContent = 'changes apply straight away. copy link: pick "copy link" in a post\u2019s share menu and it is copied with the domain you chose.';
      container.appendChild(hint);
      refresh();
    });
  }

  global.XM = { DEFAULTS, SCHEMA, PANEL_CSS, load, save, renderPanel, cleanDomain, copyDomain, closeGuideLightbox };
})(typeof window !== 'undefined' ? window : globalThis);
