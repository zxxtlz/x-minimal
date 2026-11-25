/* X minimal: content script (extension world).
 * settings -> page flags, the "options" / "search" items in the sidebar, the rounded panel layer,
 * keyboard shortcuts (like OldTwitter), and pausing videos that scroll out of view. */
(function () {
  'use strict';
  const root = document.documentElement;
  let settings = Object.assign({}, XM.DEFAULTS);

  /* ------------------------------------------------------- sidebar button toggles */
  const NAV_SPECS = [
    { key: 'sidebarHome',          ids: ['AppTabBar_Home_Link'],          href: /^\/$/ },
    { key: 'sidebarExplore',       ids: ['AppTabBar_Explore_Link'],       href: /^\/explore/ },
    { key: 'sidebarNotifications', ids: ['AppTabBar_Notifications_Link'], href: /^\/notifications/ },
    { key: 'sidebarMessages',      ids: ['AppTabBar_Messages_Link'],      href: /^\/messages/ },
    { key: 'sidebarGrok',          ids: ['AppTabBar_Grok_Link'],          label: /grok/i },
    { key: 'sidebarBookmarks',     ids: ['AppTabBar_Bookmarks_Link'],     href: /^\/i\/bookmarks/ },
    { key: 'sidebarCommunities',   ids: ['AppTabBar_Communities_Link'],   href: /^\/i\/communities/ },
    { key: 'sidebarLists',         ids: ['AppTabBar_Lists_Link'],         href: /^\/i\/lists/, label: /\blists\b/i },
    { key: 'sidebarPremium',       ids: ['AppTabBar_Premium_Link'],       href: /^\/(i\/)?premium/, label: /premium/i },
    { key: 'sidebarProfile',       ids: ['AppTabBar_Profile_Link'],       label: /profile/i },
    { key: 'sidebarCreatorStudio', ids: ['AppTabBar_CreatorStudio_Link', 'AppTabBar_Creator_Studio_Link'],
      href: /creator.?studio/i, label: /creator studio/i },
    { key: 'sidebarCalls',         ids: ['AppTabBar_Calls_Link', 'AppTabBar_Calls'],
      href: /^\/i\/calls/, label: /\bcalls\b/i },
    { key: 'sidebarMore',          ids: ['AppTabBar_More_Menu'],          label: /\bmore\b/i }
  ];
  function applySidebar() {
    const nav = document.querySelector('header[role="banner"] nav');
    if (!nav) return;
    for (const a of nav.querySelectorAll('a, [role="button"]')) {
      if (a.hasAttribute('data-xm-options') || a.hasAttribute('data-xm-search')) continue;
      // only skip inner elements of a nav item; real <a> links must always be checked
      if (a.tagName !== 'A' && a.parentElement && a.parentElement.closest('a, [role="button"]')) continue;
      const testid = a.getAttribute('data-testid') || '';
      const href = a.getAttribute('href') || '';
      const label = ((a.getAttribute('aria-label') || '') + ' ' + (a.textContent || '')).toLowerCase();
      for (const spec of NAV_SPECS) {
        const hit = (spec.ids && spec.ids.some((id) => testid.indexOf(id) !== -1)) ||
                    (spec.href && spec.href.test(href)) ||
                    (spec.label && spec.label.test(label));
        if (hit) {
          // !important so X's own inline styles can't bring a hidden button back on re-render
          if (settings[spec.key] === false) {
            a.style.setProperty('display', 'none', 'important');
            a.setAttribute('data-xm-hidden', '1');
          } else {
            a.style.removeProperty('display');
            a.removeAttribute('data-xm-hidden');
          }
          a.setAttribute('data-xm-nav', spec.key);
          break;
        }
      }
    }
  }

  /* ----------------------------------------------------------- settings -> page */
  function apply(s) {
    settings = Object.assign({}, XM.DEFAULTS, s);
    root.toggleAttribute('data-xm-gradient', !!settings.gradientAnimation);
    root.toggleAttribute('data-xm-sidebar', !!settings.showRightSidebar);
    root.toggleAttribute('data-xm-show-chat', !!settings.showFloatingChat);
    root.toggleAttribute('data-xm-show-grok', !!settings.showFloatingGrok);
    root.toggleAttribute('data-xm-keys', !!(settings.keyboardShortcuts && settings.showKeyHints));
    root.setAttribute('data-xm-settings', JSON.stringify(settings));
    // CSS-level flags: theme.css hides the matching nav items instantly, and the rules keep working
    // even when X replaces the sidebar DOM (no waiting for a JS pass).
    for (const spec of NAV_SPECS) {
      root.toggleAttribute('data-xm-hide-' + spec.key.replace(/^sidebar/, '').toLowerCase(),
                           settings[spec.key] === false);
    }
    applySidebar();
    document.dispatchEvent(new CustomEvent('xm-settings'));
  }
  apply(XM.DEFAULTS);
  XM.load().then(apply);
  // Apply immediately from the change object (no async storage round-trip) so the sidebar reacts on the same
  // tick the user flips a switch in the options panel — and on every X page/tab at once.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area && area !== 'local') return;
    for (const key of Object.keys(changes)) {
      const c = changes[key];
      settings[key] = (c && typeof c === 'object' && 'newValue' in c) ? c.newValue : c;
    }
    apply(settings);
  });

  /* ------------------------------------------------------------- options panel */
  let host = null;
  function closePanel() {
    if (host) { host.remove(); host = null; }
    document.removeEventListener('keydown', onKey, true);
    if (XM.closeGuideLightbox) XM.closeGuideLightbox();
  }
  function onKey(e) {
    if (e.key !== 'Escape' || root.hasAttribute('data-xm-guide-lightbox')) return;
    e.stopPropagation(); closePanel();
  }
  function openPanel() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'xm-panel-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = XM.PANEL_CSS;
    const overlay = document.createElement('div'); overlay.className = 'overlay';
    const panel = document.createElement('div'); panel.className = 'panel';
    overlay.appendChild(panel);
    shadow.appendChild(style); shadow.appendChild(overlay);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePanel(); });
    XM.renderPanel(panel, { onClose: closePanel });
    document.addEventListener('keydown', onKey, true);
    (document.body || root).appendChild(host);
  }

  // keys typed in the panel must not reach X's keyboard shortcuts (they would swallow letters like n, j, k, /)
  for (const type of ['keydown', 'keyup', 'keypress']) {
    window.addEventListener(type, (e) => {
      if (host && e.key !== 'Escape' && e.composedPath().indexOf(host) !== -1) e.stopImmediatePropagation();
    }, true);
  }

  /* ------------------------------------------------- "options" item in the sidebar */
  function ensureOptionsLink() {
    const nav = document.querySelector('header[role="banner"] nav');
    if (!nav || nav.querySelector('[data-xm-options]')) return;
    const links = nav.querySelectorAll('a');
    const proto = nav.querySelector('a[data-testid="AppTabBar_Profile_Link"]') || links[links.length - 1];
    if (!proto) return;

    const link = proto.cloneNode(true);
    for (const a of ['href', 'data-testid', 'aria-current', 'id']) link.removeAttribute(a);
    link.setAttribute('data-xm-options', '1');
    link.setAttribute('aria-label', 'Options');
    link.setAttribute('role', 'link');
    link.setAttribute('tabindex', '0');
    link.style.cursor = 'pointer';
    link.style.display = ''; // the profile link itself may be hidden by a sidebar toggle
    link.querySelectorAll('[aria-live], svg').forEach((n) => n.remove());
    const label = Array.from(link.querySelectorAll('span')).find((s) => s.children.length === 0 && s.textContent.trim());
    if (label) label.textContent = 'options';
    const go = (e) => { e.preventDefault(); e.stopPropagation(); openPanel(); };
    link.addEventListener('click', go, true);
    link.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); }, true);
    proto.insertAdjacentElement('afterend', link);
  }

  /* ----------------------------------------- "search  /" row under the write button */
  function focusSearch() {
    const find = () => {
      for (const el of document.querySelectorAll('input[data-testid="SearchBox_Search_Input"], input[aria-label="Search query"]')) {
        if (el.getClientRects().length) return el;
      }
      return null;
    };
    const now = find();
    if (now) { now.focus(); return; }
    // the right sidebar is hidden: go to the explore page, which has its own search box
    const explore = document.querySelector('header nav a[href="/explore"]');
    if (explore) explore.click();
    let tries = 0;
    const iv = setInterval(() => {
      const el = find();
      if (el) { clearInterval(iv); el.focus(); } else if (++tries > 40) clearInterval(iv);
    }, 100);
  }
  function ensureSearchLink() {
    let link = document.querySelector('[data-xm-search]');
    if (!settings.keyboardShortcuts) { if (link) link.remove(); return; }
    const write = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    if (!write) return;
    if (link && link.previousElementSibling === write) return;
    if (!link) {
      link = document.createElement('a');
      link.setAttribute('data-xm-search', '1');
      link.setAttribute('role', 'link');
      link.setAttribute('tabindex', '0');
      link.setAttribute('aria-label', 'Search');
      const go = (e) => { e.preventDefault(); e.stopPropagation(); focusSearch(); };
      link.addEventListener('click', go, true);
      link.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); }, true);
    }
    write.insertAdjacentElement('afterend', link);
  }

  /* ------------------------------------------------ rounded black panel behind the page */
  // The centred part of the page (sidebar + feed) is drawn as a fixed black layer with rounded corners, so the corners
  // stay rounded at the top and bottom of the window however far you scroll.
  function lca(a, b) {
    const up = new Set();
    for (let n = a; n; n = n.parentElement) up.add(n);
    for (let n = b; n; n = n.parentElement) if (up.has(n)) return n;
    return null;
  }
  let bg = null;
  function ensurePanel() {
    const header = document.querySelector('header[role="banner"]');
    const main = document.querySelector('main[role="main"]');
    if (!header || !main) return;
    const box = lca(header, main);
    if (!box || box === document.body || box === root) return;
    if (!box.hasAttribute('data-xm-panel')) {
      document.querySelectorAll('[data-xm-panel]').forEach((n) => n.removeAttribute('data-xm-panel'));
      box.setAttribute('data-xm-panel', '1');
    }
    if (!bg || !bg.isConnected) {
      bg = document.createElement('div');
      bg.id = 'xm-panel-bg';
      (document.body || root).appendChild(bg);
    }
    root.setAttribute('data-xm-panel-layer', '1');
    const r = box.getBoundingClientRect();
    const left = Math.round(r.left) + 'px', width = Math.round(r.width) + 'px';
    if (bg.style.left !== left) bg.style.left = left;
    if (bg.style.width !== width) bg.style.width = width;
  }
  window.addEventListener('resize', () => { try { ensurePanel(); } catch (e) { /* ignore */ } });

  /* ---------------------------------------------------- pause videos out of view */
  const watched = new WeakSet();
  let io = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      if (!settings.pauseOutOfView) return;
      for (const en of entries) {
        const v = en.target;
        if (document.pictureInPictureElement === v || document.fullscreenElement === v) continue;
        const gone = !en.isIntersecting || en.intersectionRatio < 0.2;
        if (gone && !v.paused) {
          v.setAttribute('data-xm-autopaused', '1');
          v.pause();
        } else if (!gone && en.intersectionRatio >= 0.5 && v.hasAttribute('data-xm-gif') && v.hasAttribute('data-xm-autopaused')) {
          // a gif that we paused comes back into view: let it loop again
          v.removeAttribute('data-xm-autopaused');
          const p = v.play(); if (p && p.catch) p.catch(() => {});
        }
      }
    }, { threshold: [0, 0.2, 0.5] });
  }
  function observeVideos() {
    if (!io) return;
    for (const v of document.querySelectorAll('video')) {
      if (!watched.has(v)) { watched.add(v); io.observe(v); }
    }
  }

  /* ------------------------------------------------------------ keyboard shortcuts */
  let selected = null;
  const posts = () => Array.from(document.querySelectorAll('main article[data-testid="tweet"]'));
  function visibleRatio(el) {
    const r = el.getBoundingClientRect();
    const h = innerHeight || 800;
    return Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)) / Math.max(1, Math.min(r.height, h));
  }
  const videoOf = (a) => a && (a.querySelector('video[data-xm-own]') || a.querySelector('video'));
  // The video the user is actually looking at / controlling. When a video's native controls have focus, use that
  // one; otherwise fall back to the post selected with w / s. This stops space from pausing a video 2 posts above.
  const focusedVideo = () => {
    const t = document.activeElement;
    return t && t.tagName === 'VIDEO' && t.isConnected ? t : null;
  };
  // Native <video controls> are focusable with tabindex, but some sites remove it; keep ours reachable.
  function makeFocusable(v) {
    if (!v) return;
    if (!v.hasAttribute('tabindex')) v.setAttribute('tabindex', '0');
    v.setAttribute('data-xm-focusable', '1');
  }
  function imagesOf(a) {
    if (!a) return [];
    const photos = a.querySelectorAll('[data-testid="tweetPhoto"] img');
    if (photos.length) return photos;
    // X sometimes renders media without that test id: fall back to the image URLs themselves
    return Array.from(a.querySelectorAll('img')).filter((img) => {
      if (img.closest('article') && img.closest('article') !== a) return false; // quoted post
      return /^https:\/\/pbs\.twimg\.com\/media\//i.test(img.currentSrc || img.src || img.getAttribute('src') || '');
    });
  }
  function play(v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }

  function setSelected(el) {
    if (selected && selected !== el) {
      selected.removeAttribute('data-xm-selected');
      const pv = videoOf(selected);
      if (pv && !pv.paused && settings.pauseOutOfView) { pv.setAttribute('data-xm-autopaused', '1'); pv.pause(); }
    }
    selected = el;
    el.setAttribute('data-xm-selected', '1');
    el.scrollIntoView({ block: 'center' });
    const v = videoOf(el);
    if (v) {
      makeFocusable(v);
      v.focus({ preventScroll: true });
    } else if (focusedVideo()) {
      // the post we moved to has no video: don't leave an older video's controls focused
      document.activeElement.blur();
    }
    if (settings.playSelectedVideo && v && v.paused) {
      v.removeAttribute('data-xm-autopaused');
      play(v);
    }
  }
  function move(dir) {
    const list = posts();
    if (!list.length) return;
    let i = selected && selected.isConnected ? list.indexOf(selected) : -1;
    if (i !== -1 && visibleRatio(selected) < 0.1) i = -1;           // the selection scrolled away: start from the screen
    if (i === -1) {
      i = list.findIndex((a) => a.getBoundingClientRect().bottom > 100);
      if (i === -1) i = 0;
    } else {
      i = Math.min(list.length - 1, Math.max(0, i + dir));
    }
    setSelected(list[i]);
  }
  function current() {
    if (selected && selected.isConnected && visibleRatio(selected) >= 0.1) return selected;
    return null;
  }
  function clickIn(article, ids) {
    for (const id of ids) {
      const b = article.querySelector('[data-testid="' + id + '"]');
      if (b) { b.click(); return true; }
    }
    return false;
  }
  function openPost(article) {
    const time = article.querySelector('time');
    const a = time && time.closest('a');
    if (a) a.click();
  }
  function newPost() {
    const b = document.querySelector('[data-testid="SideNav_NewTweet_Button"]') || document.querySelector('a[href="/compose/post"]');
    if (b) b.click();
  }

  function isTyping(t) {
    if (!t || !t.closest) return false;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
    return !!t.closest('[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]');
  }
  const overlayOpen = () => !!document.querySelector('#layers [role="dialog"], #layers [aria-modal="true"], #layers [role="menu"]');
  const onInteractive = (t) => !!(t && t.closest && t.closest('a[href], button, [role="button"], [role="link"], [role="menuitem"], video'));
  // w / s now leaves the video's controls focused; that video must not count as a "typing/interactive" target.
  const blockedTarget = (t) => onInteractive(t) && t !== focusedVideo();

  window.addEventListener('keydown', (e) => {
    // no shortcuts while typing, in chat, in a dialog/menu, in our options panel, in the guide lightbox or in the gallery
    if (!settings.keyboardShortcuts || host || root.hasAttribute('data-xm-chat') ||
        root.hasAttribute('data-xm-gallery-open') || root.hasAttribute('data-xm-guide-lightbox')) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.shiftKey) return;
    if (isTyping(e.target) || overlayOpen()) return;

    // physical keys, so they also work on non-latin keyboard layouts (w / s are the same keys on a cyrillic layout)
    const code = e.code;
    let handled = true;
    if (code === 'KeyW') move(-1);
    else if (code === 'KeyS') move(1);
    else if (e.key === '/' || code === 'Slash') { if (e.repeat) return; focusSearch(); }
    else if (code === 'KeyN') { if (e.repeat) return; newPost(); }
    else if (code === 'Space' || code === 'Enter') {
      if (e.repeat) return;
      if (code === 'Space') {
        // Space controls the video whose controls are focused — i.e. the one w / s just moved to — not whichever
        // post happens to still carry the selected marker.
        const fv = focusedVideo();
        if (fv) {
          if (blockedTarget(e.target)) return;
          if (fv.paused) { fv.removeAttribute('data-xm-autopaused'); play(fv); } else fv.pause();
        } else {
          const a = current();
          if (!a) return;
          const v = videoOf(a);
          if (v) {
            if (blockedTarget(e.target)) return;
            if (v.paused) { v.removeAttribute('data-xm-autopaused'); play(v); } else v.pause();
          } else if (imagesOf(a).length && !a.querySelector('video')) {
            // a focused tweet wrapper is [role="link"]: don't let it swallow space here
            if (e.target && e.target.closest && e.target.closest('a[href], button, [role="button"], [role="menuitem"], video')) return;
            // bubbles: true so the event reaches the page-world listener in main.js
            document.dispatchEvent(new CustomEvent('xm-open-gallery', { bubbles: true }));
          } else return;                                             // no media: let the page scroll as usual
        }
      } else {
        const a = current();
        if (!a) return;
        if (blockedTarget(e.target)) return;
        openPost(a);
      }
    } else if (code === 'KeyL' || code === 'KeyB' || code === 'KeyT' || code === 'KeyR') {
      const a = current();
      if (!a || e.repeat) return;
      if (code === 'KeyL') clickIn(a, ['like', 'unlike']);
      else if (code === 'KeyB') clickIn(a, ['bookmark', 'removeBookmark']);
      else if (code === 'KeyT') clickIn(a, ['retweet', 'unretweet']);
      else clickIn(a, ['reply']);
    } else handled = false;

    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  /* ------------------------------------------------------------------- scheduler */
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      try { applySidebar(); } catch (e) { /* never break X */ }
      try { ensureOptionsLink(); } catch (e) { /* never break X */ }
      try { ensureSearchLink(); } catch (e) { /* never break X */ }
      try { ensurePanel(); } catch (e) { /* never break X */ }
      try { observeVideos(); } catch (e) { /* never break X */ }
    });
  }
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  setInterval(schedule, 500);
  schedule();
  document.addEventListener('DOMContentLoaded', schedule);
})();
