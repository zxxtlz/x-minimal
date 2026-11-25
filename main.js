/* X minimal: page-context script (runs in the page so it can see X's own API responses, clipboard and <video> elements)
 *  1. flags the current route on <html> so the stylesheet can switch layouts (chat, profile photo)
 *  2. bounce on the like / repost / keep labels
 *  3. tags the floating chat / grok buttons so the stylesheet can hide or show them
 *  4. "copy link" in the share menu copies the domain you picked (fxtwitter.com, vxtwitter.com, custom ...)
 *  5. native video player, modelled on OldTwitter: an ordinary <video controls> over X's player, fed with the
 *     .mp4 files from X's own data (right-click -> open in new tab / save as / picture-in-picture work).
 *     X's own player is never modified: if a video can't be matched, or the mp4 fails to load, you get X's player.
 *     GIFs get the same treatment: an ordinary looping <video controls> (muted, autoplay) instead of X's GIF player.
 * Settings come from the extension (content.js) through the data-xm-settings attribute on <html>.
 */
(function () {
  'use strict';
  if (window.__xMinimalLoaded) return;
  window.__xMinimalLoaded = true;

  const OPTIONS = {
    nativeVideo: true, gifsAsVideos: true, videoQuality: 0, bounce: true, copyLinksAs: '', customCopyDomain: ''
  };
  const root = document.documentElement;
  const PLAYER = '[data-testid="videoPlayer"]';

  function readSettings() {
    try { Object.assign(OPTIONS, JSON.parse(root.getAttribute('data-xm-settings') || '{}')); } catch (e) { /* keep defaults */ }
  }
  readSettings();
  document.addEventListener('xm-settings', () => { readSettings(); schedule(); });

  /* ---------------------------------------------------------------- route flags */
  function route() {
    const p = location.pathname;
    root.toggleAttribute('data-xm-chat', /^\/(i\/chat|messages)/.test(p));
    root.toggleAttribute('data-xm-post', /\/status\/\d+/.test(p));
    root.toggleAttribute('data-xm-photo', /^\/[^/]+\/photo\/?$/.test(p));
  }
  route();
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); route(); return r; };
  }
  addEventListener('popstate', route);

  /* ------------------------------------------------------------ shared scheduler */
  let videoTick = null;
  let queued = false;
  let lastFloat = 0;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      try { if (videoTick) videoTick(); } catch (e) { /* never break X */ }
      try { tagFloating(); } catch (e) { /* never break X */ }
      try { updateStats(); } catch (e) { /* never break X */ }
    });
  }

  /* ------------------------------------------------------- helpers for posts */
  function articleId(article) {
    const time = article && article.querySelector('time');
    const a = time && time.closest('a');
    const m = a && /\/([^/]+)\/status\/(\d+)/.exec(a.getAttribute('href') || '');
    return m ? { path: '/' + m[1] + '/status/' + m[2], id: m[2] } : null;
  }
  function findArticleById(id) {
    for (const a of document.querySelectorAll('article')) {
      const x = articleId(a);
      if (x && x.id === id) return a;
    }
    return null;
  }

  /* ------------------------------------------- the numbers under a post, as plain text */
  // X's buttons carry the numbers, which makes the numbers clickable and drags each button's box (and so its menu)
  // to the left. We read them and draw one plain-text line instead; the stylesheet hides X's own count text.
  const STAT_IDS = { likes: ['like', 'unlike'], reposts: ['retweet', 'unretweet'], replies: ['reply'] };
  function countText(group, ids) {
    for (const id of ids) {
      const btn = group.querySelector('[data-testid="' + id + '"]');
      if (btn) {
        const c = btn.querySelector('[data-testid="app-text-transition-container"]');
        return c ? c.textContent.trim() : '';
      }
    }
    return null; // that button is not in this row
  }
  const plural = (n, one, many) => (n === '1' ? one : many);
  function updateStats() {
    for (const group of document.querySelectorAll('article [role="group"]')) {
      const likes = countText(group, STAT_IDS.likes);
      if (likes === null) continue; // not a post's action row
      const reposts = countText(group, STAT_IDS.reposts);
      const replies = countText(group, STAT_IDS.replies);
      let el = null;
      for (const ch of group.children) if (ch.hasAttribute('data-xm-stats-text')) { el = ch; break; }
      if (!el) {
        el = document.createElement('div');
        el.setAttribute('data-xm-stats-text', '1');
        group.insertBefore(el, group.firstChild);
        group.setAttribute('data-xm-stats', '1');
      }
      const liked = !!group.querySelector('[data-testid="unlike"]');
      const parts = [];
      if (likes) parts.push(likes + ' ' + plural(likes, 'like', 'likes'));
      if (reposts) parts.push(reposts + ' ' + plural(reposts, 'repost', 'reposts'));
      if (replies) parts.push(replies + ' ' + plural(replies, 'reply', 'replies'));
      const sig = (liked ? '1|' : '0|') + parts.join('\u00B7');
      if (el.getAttribute('data-sig') === sig) continue;
      el.setAttribute('data-sig', sig);
      el.textContent = '';
      if (liked) {
        const dot = document.createElement('span'); dot.className = 'xm-dot';
        const word = document.createElement('span'); word.className = 'xm-liked'; word.textContent = 'liked';
        el.appendChild(dot); el.appendChild(word);
      }
      el.appendChild(document.createTextNode(parts.join(' \u00B7 ')));
    }
  }

  /* ---------------------------------------- bounce after you like / repost / keep */
  // X flips data-testid from "like" to "unlike" (etc.) a moment after the click. When the "done" button shows up,
  // it gets data-xm-pop for a moment and the stylesheet plays the bounce on its label.
  function popWhenReady(article, selector) {
    if (!article) return;
    const info = articleId(article);
    let tries = 0;
    const iv = setInterval(() => {
      const a = article.isConnected ? article : (info && findArticleById(info.id));
      const el = a && a.querySelector(selector);
      if (el || ++tries > 40) {
        clearInterval(iv);
        if (el) {
          el.setAttribute('data-xm-pop', '1');
          setTimeout(() => el.removeAttribute('data-xm-pop'), 900);
        }
      }
    }, 50);
  }

  /* ------------------------------------------------ copy link as another domain */
  const KNOWN_DOMAINS = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  function copyDomain() {
    if (!OPTIONS.copyLinksAs) return '';
    const raw = OPTIONS.copyLinksAs === 'custom' ? OPTIONS.customCopyDomain : OPTIONS.copyLinksAs;
    const d = String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    return KNOWN_DOMAINS.test(d) ? d : '';
  }
  let copyPending = 0;   // time of the last "copy link" click; consumed by the first link X copies afterwards
  let copyStamp = 0;
  let copyTimer = 0;
  let rewrote = false;
  let lastSharePath = '';

  const origWrite = typeof Clipboard !== 'undefined' ? Clipboard.prototype.writeText : null;
  if (origWrite) {
    Clipboard.prototype.writeText = function (text) {
      try {
        const d = copyDomain();
        if (d && Date.now() - copyPending < 1500) {
          const m = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i.exec(String(text).trim());
          if (m) { text = 'https://' + d + '/' + m[1] + '/status/' + m[2]; rewrote = true; copyPending = 0; }
        }
      } catch (e) { /* ignore */ }
      return origWrite.call(this, text);
    };
  }

  /* --------------------------------------------------------- click bookkeeping */
  let lastRepostArticle = null;
  addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('[data-testid="like"], [data-testid="unlike"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="retweetConfirm"], [data-testid="bookmark"], [data-testid="removeBookmark"]')) {
      setTimeout(schedule, 250); setTimeout(schedule, 900); // refresh the numbers once X has updated them
    }
    if (OPTIONS.bounce) {
      const like = t.closest('[data-testid="like"]');
      if (like) popWhenReady(like.closest('article'), '[data-testid="unlike"]');
      const keep = t.closest('[data-testid="bookmark"]');
      if (keep) popWhenReady(keep.closest('article'), '[data-testid="removeBookmark"]');
      const rt = t.closest('[data-testid="retweet"]');
      if (rt) lastRepostArticle = rt.closest('article');
      if (t.closest('[data-testid="retweetConfirm"]')) popWhenReady(lastRepostArticle, '[data-testid="unretweet"]');
    }

    const share = t.closest('button[aria-label="Share post"]');
    if (share) {
      const x = articleId(share.closest('article'));
      if (x) lastSharePath = x.path;
    }
    const item = t.closest('[role="menuitem"]');
    if (item && copyDomain()) {
      const txt = (item.textContent || '').trim();
      if (item.getAttribute('data-testid') === 'copyLink' || /^copy link( to post)?$/i.test(txt)) {
        copyPending = copyStamp = Date.now();
        rewrote = false;
        const path = lastSharePath;
        const stamp = copyStamp;
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => { // in case X copied without going through navigator.clipboard.writeText
          try {
            if (!rewrote && stamp === copyStamp && path && origWrite) {
              origWrite.call(navigator.clipboard, 'https://' + copyDomain() + path);
            }
          } catch (err) { /* ignore */ }
        }, 250);
      }
    }
  }, true);

  /* ----------------------------------- floating chat / grok button, bottom-right */
  function kindOf(el) {
    const c = el.closest('[data-testid]');
    const s = [el.getAttribute('aria-label'), el.getAttribute('data-testid'), c && c.getAttribute('data-testid')].join(' ').toLowerCase();
    return /grok/.test(s) ? 'grok' : 'chat';
  }
  function tagFloating() {
    const now = Date.now();
    if (now - lastFloat < 1500) return;
    lastFloat = now;
    const W = innerWidth, H = innerHeight;
    const found = [];
    const cands = document.querySelectorAll(
      'button:not(header *):not(main *):not(article *), [role="button"]:not(header *):not(main *):not(article *)'
    );
    for (const el of cands) {
      if (el.closest('[role="dialog"], [role="menu"], [aria-modal="true"], [data-xm-float]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.width > 100 || r.height > 100 || r.left < W * 0.6 || r.top < H * 0.55) continue;
      if (!el.querySelector('svg')) continue;
      let fixed = null;
      for (let n = el, i = 0; n && n !== document.body && i < 8; n = n.parentElement, i++) {
        if (getComputedStyle(n).position === 'fixed') fixed = n; // outermost fixed box
      }
      if (fixed) found.push({ el, fixed, kind: kindOf(el) });
    }
    const kinds = new Map();
    for (const f of found) {
      const s = kinds.get(f.fixed) || new Set();
      s.add(f.kind);
      kinds.set(f.fixed, s);
    }
    for (const f of found) {
      // one kind in the box: tag the whole box; several kinds (grok + chat stacked): tag each button
      (kinds.get(f.fixed).size === 1 ? f.fixed : f.el).setAttribute('data-xm-float', f.kind);
    }
  }

  /* ------------------------------------------- image gallery (OldTwitter style) */
  // With a post selected via w / s, space (or a click on its photo) opens that post's photos at full size,
  // without opening the post. X serves bigger files through the image URL's "name" parameter.
  const GALLERY_CSS = `
    .xm-gallery { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.94); color: var(--xm-ink);
      display: flex; flex-direction: column; font-family: var(--xm-font); }
    .xm-gallery * { box-sizing: border-box; text-transform: lowercase; }
    .xm-gallery-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 18px 8px; font-size: 12px; letter-spacing: .04em; color: var(--xm-muted); }
    .xm-gallery-head button, .xm-gallery-nav { background: var(--xm-hover); color: var(--xm-ink);
      border: 1px solid var(--xm-line); border-radius: var(--xm-radius); cursor: pointer;
      transition: background .15s, border-color .15s, color .15s, transform .15s; }
    .xm-gallery-head button { padding: 6px 12px; font-size: 12px; }
    .xm-gallery-head button:hover, .xm-gallery-nav:hover { background: #141414; border-color: #3a3a3a;
      color: var(--xm-ink-strong); }
    .xm-gallery-nav:active { transform: scale(.94); }
    .xm-gallery-body { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; }
    .xm-gallery-nav { position: absolute; top: 50%; margin-top: -32px; z-index: 2;
      width: 46px; height: 64px; font-size: 26px; line-height: 1;
      display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; }
    .xm-gallery-nav[data-side="prev"] { left: 8px; }
    .xm-gallery-nav[data-side="next"] { right: 8px; }
    .xm-gallery-img { max-width: 100%; max-height: 100%; object-fit: contain; cursor: grab; touch-action: none;
      transform-origin: center center; user-select: none; -webkit-user-drag: none; -webkit-user-select: none;
      border: 1px solid var(--xm-line); border-radius: 8px; box-shadow: 0 18px 60px rgba(0,0,0,.75); }
    .xm-gallery-img[data-dragging] { cursor: grabbing; }
    .xm-gallery-thumbs { display: flex; justify-content: center; gap: 8px; padding: 12px 20px 18px; overflow-x: auto;
      scrollbar-width: thin; scrollbar-color: #2a2a2a transparent; }
    .xm-gallery-thumb { flex: none; width: 56px; height: 56px; object-fit: cover; border: 1px solid var(--xm-line);
      border-radius: var(--xm-radius); cursor: pointer; opacity: .45;
      transition: opacity .15s, border-color .15s, transform .15s; }
    .xm-gallery-thumb:hover { opacity: .8; transform: translateY(-2px); }
    .xm-gallery-thumb[data-active] { opacity: 1; border-color: var(--xm-ink); }
    @media (max-width: 620px) {
      .xm-gallery-head { padding: 10px 10px 6px; gap: 8px; }
      .xm-gallery-head > span:first-child { font-size: 10px !important; letter-spacing: 0 !important;
        max-width: 60%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .xm-gallery-head button { padding: 5px 8px; font-size: 10px; }
      .xm-gallery-body { padding: 0; }
      .xm-gallery-nav { width: 34px; height: 50px; margin-top: -25px; font-size: 22px; opacity: .8; }
      .xm-gallery-nav[data-side="prev"] { left: 2px; }
      .xm-gallery-nav[data-side="next"] { right: 2px; }
      .xm-gallery-thumbs { gap: 5px; padding: 8px 10px 12px; }
      .xm-gallery-thumb { width: 40px; height: 40px; }
    }
  `;
  let galleryStyle = null;
  let gallery = null;

  function ensureGalleryStyle() {
    if (galleryStyle && galleryStyle.isConnected) return;
    galleryStyle = document.createElement('style');
    galleryStyle.id = 'xm-gallery-style';
    galleryStyle.textContent = GALLERY_CSS;
    (document.head || root).appendChild(galleryStyle);
  }
  const mediaId = (src) => {
    const m = /\/media\/([^/?#]+)/.exec(String(src || ''));
    return m ? m[1] : String(src || '');
  };
  function galleryUrls(article) {
    const out = [], seen = new Set();
    if (!article) return out;
    const add = (img) => {
      if (!img) return;
      if (img.closest('article') && img.closest('article') !== article) return; // not a quoted post's photo
      const src = img.currentSrc || img.src || img.getAttribute('src') || '';
      if (!/^https:\/\/pbs\.twimg\.com\/media\//i.test(src) || /\/(profile_images|emoji)\//i.test(src)) return;
      const id = mediaId(src);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, src });
    };
    const photos = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    if (photos.length) photos.forEach(add);
    else article.querySelectorAll('img').forEach(add);
    return out;
  }
  function variants(src) {
    const list = [];
    try {
      const u = new URL(src, location.href);
      if (/^pbs\.twimg\.com$/i.test(u.hostname)) {
        for (const name of ['orig', 'large', 'medium']) {
          const v = new URL(u.href);
          v.searchParams.set('name', name);
          list.push(v.href);
        }
      }
    } catch (e) { /* keep the original URL */ }
    list.push(src);
    return Array.from(new Set(list));
  }
  // Lock the page in place without touching overflow: on Firefox, toggling overflow on <html>/<body> makes the
  // document scroll back to the top. Wheel / touch / key scrolling is already swallowed separately, so all we need
  // here is to pin the exact scroll offset for the whole time the gallery is open.
  let lockedScroll = null;
  function pinScroll() {
    if (!gallery || !lockedScroll) return;
    if (window.scrollX !== lockedScroll.x || window.scrollY !== lockedScroll.y) {
      window.scrollTo(lockedScroll.x, lockedScroll.y);
    }
  }
  addEventListener('scroll', pinScroll, { passive: true });

  function closeGallery() {
    if (!gallery) return;
    gallery.overlay.remove();
    gallery = null;
    lockedScroll = null;
    root.removeAttribute('data-xm-gallery-open');
  }
  function showGallery(article, start) {
    const items = galleryUrls(article);
    if (!items.length) return;
    ensureGalleryStyle();
    closeGallery();

    const overlay = document.createElement('div');
    overlay.className = 'xm-gallery'; overlay.setAttribute('data-xm-gallery', '1');
    const head = document.createElement('div'); head.className = 'xm-gallery-head';
    const counter = document.createElement('span');
    const open = document.createElement('button'); open.type = 'button'; open.textContent = 'open original';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'close  esc';
    const tools = document.createElement('span'); tools.append(open, close);
    head.append(counter, tools);
    const body = document.createElement('div'); body.className = 'xm-gallery-body';
    const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'xm-gallery-nav';
    prev.textContent = '\u2039'; prev.setAttribute('data-side', 'prev');
    const img = document.createElement('img'); img.className = 'xm-gallery-img'; img.alt = 'post image';
    img.draggable = false; // stop Firefox's native "drag the image file" from stealing our pan gesture
    const next = document.createElement('button'); next.type = 'button'; next.className = 'xm-gallery-nav';
    next.textContent = '\u203A'; next.setAttribute('data-side', 'next');
    body.append(prev, img, next);
    const thumbs = document.createElement('div'); thumbs.className = 'xm-gallery-thumbs';
    overlay.append(head, body, thumbs);
    lockedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
    (document.body || root).appendChild(overlay);
    root.setAttribute('data-xm-gallery-open', '1');

    const state = { overlay, img, counter, thumbs, items, urls: items.map((x) => variants(x.src)),
      index: start || 0, variant: 0, zoom: 1, tx: 0, ty: 0 };
    gallery = state;

    const MIN_ZOOM = 0.2, MAX_ZOOM = 8; // 20% (= 500% zoomed out) up to 800%
    function applyTransform() {
      state.img.style.transform = 'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.zoom + ')';
    }
    function updateCounter() {
      state.counter.textContent = 'image ' + (state.index + 1) + '/' + state.items.length +
        ' \u00b7 ' + Math.round(state.zoom * 100) + '% \u00b7 scroll zoom \u00b7 drag move \u00b7 \u2190 \u2192 a / d';
    }
    function resetView() { state.zoom = 1; state.tx = 0; state.ty = 0; applyTransform(); updateCounter(); }

    function render() {
      const n = state.items.length;
      state.index = (state.index + n) % n;
      state.variant = 0;
      resetView();
      state.img.onerror = () => {
        if (state.variant < state.urls[state.index].length - 1) {
          state.img.src = state.urls[state.index][++state.variant];
        } else state.img.onerror = null;
      };
      state.img.src = state.urls[state.index][0];
      for (const t of state.thumbs.children) {
        if (Number(t.getAttribute('data-index')) === state.index) t.setAttribute('data-active', '1');
        else t.removeAttribute('data-active');
      }
    }
    function go(step) { if (state.items.length > 1) { state.index += step; render(); } }
    state.go = go;

    prev.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); go(1); });
    close.addEventListener('click', (e) => { e.stopPropagation(); closeGallery(); });
    open.addEventListener('click', (e) => {
      e.stopPropagation();
      try { window.open(state.urls[state.index][state.variant], '_blank', 'noopener'); } catch (err) { /* ignore */ }
    });
    // wheel zooms, dragging pans; a drag must not count as a click-to-next
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, suppressClick = false;
    img.addEventListener('dragstart', (e) => e.preventDefault());
    img.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      const delta = Number(e.deltaY) || 0;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * Math.exp(-delta * 0.0015)));
      if (!isFinite(next)) return;
      state.zoom = next;
      applyTransform();
      updateCounter();
    }, { passive: false });
    img.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; suppressClick = false;
      sx = e.clientX; sy = e.clientY; ox = state.tx; oy = state.ty;
      img.setAttribute('data-dragging', '1');
      try { img.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    img.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) suppressClick = true;
      state.tx = ox + dx; state.ty = oy + dy;
      applyTransform();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      img.removeAttribute('data-dragging');
      try { img.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    img.addEventListener('pointerup', endDrag);
    img.addEventListener('pointercancel', endDrag);
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (suppressClick) { suppressClick = false; return; }
      go(1);
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target === body) closeGallery(); });

    if (state.items.length > 1) {
      state.items.forEach((x, i) => {
        const t = document.createElement('img');
        t.className = 'xm-gallery-thumb'; t.alt = 'image ' + (i + 1); t.setAttribute('data-index', String(i));
        t.src = x.src;
        t.addEventListener('click', (e) => { e.stopPropagation(); state.index = i; render(); });
        state.thumbs.appendChild(t);
      });
    } else state.thumbs.style.display = 'none';
    render();
  }

  document.addEventListener('xm-open-gallery', () => {
    const a = document.querySelector('article[data-xm-selected="1"]');
    if (a && !a.querySelector('video')) showGallery(a, 0);
  });

  // A click on a photo in an image-only post always opens our gallery — no selection needed. The post is never
  // opened from its image: only clicking the post itself (text, timestamp, buttons) does that.
  function clickedPhoto(t) {
    if (!t || !t.closest) return null;
    const photo = t.closest('[data-testid="tweetPhoto"]');
    if (photo) return photo;
    if (t.tagName === 'IMG' && /^https:\/\/pbs\.twimg\.com\/media\//i.test(t.currentSrc || t.src || '')) return t;
    return null;
  }
  function galleryArticleFor(t) {
    const photo = clickedPhoto(t);
    if (!photo) return null;
    const article = photo.closest('article[data-testid="tweet"]');
    if (!article || article.querySelector('video')) return null; // video posts keep X's own behaviour
    return galleryUrls(article).length ? article : null;
  }
  // X starts its client-side navigation on pointerdown/mousedown — before our click handler runs — and that
  // navigation scrolls the timeline to the top. Stop those events on gallery photos (without preventing the click).
  for (const type of ['pointerdown', 'mousedown']) {
    addEventListener(type, (e) => {
      if (gallery || root.hasAttribute('data-xm-gallery-open')) return;
      if (!galleryArticleFor(e.target)) return;
      e.stopImmediatePropagation();
    }, true);
  }
  addEventListener('click', (e) => {
    if (gallery || root.hasAttribute('data-xm-gallery-open')) return;
    const article = galleryArticleFor(e.target);
    if (!article) return;
    const photo = clickedPhoto(e.target);
    const clicked = photo.querySelector ? photo.querySelector('img') : photo;
    const id = clicked && mediaId(clicked.currentSrc || clicked.src || '');
    const items = galleryUrls(article);
    const i = Math.max(0, items.findIndex((x) => x.id === id));
    e.preventDefault();
    e.stopImmediatePropagation();
    showGallery(article, i);
  }, true);

  addEventListener('keydown', (e) => {
    if (!gallery) return;
    let handled = true;
    if (e.key === 'Escape' || e.code === 'Escape') closeGallery();
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') gallery.go(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Space') gallery.go(1);
    else if (/^(PageUp|PageDown|Home|End)$/.test(e.code)) { /* swallow scroll keys */ }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // The gallery covers the viewport but X keeps scrolling underneath. Swallow wheel / touch scrolling at the
  // document level while it is open; the image's own wheel handler still runs because we never stop propagation.
  function blockPageScroll(e) { if (gallery) e.preventDefault(); }
  document.addEventListener('wheel', blockPageScroll, { passive: false, capture: true });
  document.addEventListener('touchmove', blockPageScroll, { passive: false, capture: true });

  /* ------------------------------------------ mp4 links from X's own API responses */
  // thumbnail key -> { poster, mp4s: [{url, bitrate, height}] }   (videos only, GIFs are skipped)
  const media = new Map();
  // tweet id -> [entry, ...]
  const byTweet = new Map();
  const key = (u) => String(u || '').split('?')[0].replace(/\.(jpe?g|png|webp)$/i, '');

  function scan(node, depth) {
    if (!node || typeof node !== 'object' || depth > 40) return;
    if (Array.isArray(node)) { for (const n of node) scan(n, depth + 1); return; }
    if (node.media_url_https && node.video_info && Array.isArray(node.video_info.variants) && node.type === 'video') {
      const mp4s = [];
      for (const v of node.video_info.variants) {
        if (v && v.content_type === 'video/mp4' && v.url) {
          const size = /\/(\d+)x(\d+)\//.exec(v.url);
          mp4s.push({ url: v.url, bitrate: v.bitrate || 0, height: size ? +size[2] : 0 });
        }
      }
      if (mp4s.length) {
        const entry = { poster: node.media_url_https, mp4s };
        media.set(key(node.media_url_https), entry);
        const id = /\/status\/(\d+)\//.exec(String(node.expanded_url || node.url || ''));
        if (id) {
          const list = byTweet.get(id[1]) || [];
          if (!list.some((e) => e.poster === entry.poster)) list.push(entry);
          byTweet.set(id[1], list);
        }
      }
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') scan(v, depth + 1);
    }
  }

  function ingest(text) {
    try { scan(JSON.parse(text), 0); } catch (e) { /* not json */ }
    schedule();
  }

  const isApi = (u) => /\/(graphql|i\/api)\//.test(String(u));

  const origFetch = window.fetch;
  window.fetch = function () {
    const p = origFetch.apply(this, arguments);
    try {
      const a = arguments[0];
      const url = typeof a === 'string' ? a : (a && a.url) || '';
      if (isApi(url)) p.then((r) => r.clone().text().then(ingest)).catch(() => {});
    } catch (e) { /* never break X */ }
    return p;
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isApi(url)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') ingest(this.responseText);
          else if (this.responseType === 'json') { scan(this.response, 0); schedule(); }
        } catch (e) { /* ignore */ }
      });
    }
    return xhrOpen.apply(this, arguments);
  };

  /* --------------------------------------- X's own video stays quiet while ours is shown */
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      if (!this.hasAttribute('data-xm-own') && this.closest && this.closest('[data-xm-replaced="1"]')) {
        return Promise.resolve();
      }
    } catch (e) { /* ignore */ }
    return origPlay.apply(this, arguments);
  };

  /* right-click on our player must reach the browser's own menu */
  addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('[data-xm-own]')) e.stopImmediatePropagation();
  }, true);

  /* ------------------------------------------------ matching a player to its mp4 files */
  function entryForPlayer(player) {
    const xv = player.querySelector('video:not([data-xm-own])');
    if (xv) {
      const e = media.get(key(xv.getAttribute('poster')));
      if (e) return e;
    }
    for (const img of player.querySelectorAll('img')) {
      const e = media.get(key(img.currentSrc || img.src));
      if (e) return e;
    }
    for (const el of player.querySelectorAll('[style*="background-image"]')) {
      const m = /url\(["']?([^"')]+)/.exec(el.getAttribute('style') || '');
      const e = m && media.get(key(m[1]));
      if (e) return e;
    }
    // last resort: a post with exactly one video, and X's data has exactly one video for that post
    const article = player.closest('article');
    if (article && article.querySelectorAll(PLAYER).length === 1) {
      const x = articleId(article);
      const list = x && byTweet.get(x.id);
      if (list && list.length === 1) return list[0];
    }
    return null;
  }

  function order(entry) {
    const list = entry.mp4s.slice().sort((a, b) => b.bitrate - a.bitrate);
    const want = Number(OPTIONS.videoQuality) || 0;
    if (want && list.length > 1) {
      const best = list.reduce((p, c) => (Math.abs((c.height || 0) - want) < Math.abs((p.height || 0) - want) ? c : p));
      list.splice(list.indexOf(best), 1);
      list.unshift(best);
    }
    return list.map((x) => x.url);
  }

  /* ------------------------------------------------------- our plain <video controls> */
  function giveUp(player, mine) {
    // the mp4 did not load: hand the player back to X, as if the extension were not there
    if (mine.parentNode) mine.parentNode.removeChild(mine);
    player.removeAttribute('data-xm-replaced');
    player.setAttribute('data-xm-failed', '1');
  }

  function replace(player, entry) {
    const urls = order(entry);
    if (!urls.length) return;

    const mine = document.createElement('video');
    mine.setAttribute('data-xm-own', '1');
    mine.controls = true;
    mine.preload = 'none';
    mine.playsInline = true;
    mine.disableRemotePlayback = true;
    mine.poster = entry.poster;
    mine.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:10;';

    const sources = urls.map((url) => {
      const s = document.createElement('source');
      s.src = url;
      s.type = 'video/mp4';
      mine.appendChild(s);
      return s;
    });
    // <source> errors do not bubble, but a capture listener on the video still sees them
    mine.addEventListener('error', (e) => {
      if (e.target === sources[sources.length - 1] || e.target === mine) giveUp(player, mine);
    }, true);

    // clicks on the native controls must not reach X (it would open the post)
    for (const type of ['click', 'dblclick']) mine.addEventListener(type, (e) => e.stopPropagation());

    if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
    player.setAttribute('data-xm-replaced', '1');
    player.appendChild(mine);
  }

  /* GIFs: X plays them from a plain mp4 already; we lay a looping <video controls> over X's GIF player */
  function replaceGif(holder, xv, src) {
    const mine = document.createElement('video');
    mine.setAttribute('data-xm-own', '1');
    mine.setAttribute('data-xm-gif', '1');
    mine.controls = true;
    mine.loop = true;
    mine.muted = true;
    mine.defaultMuted = true;
    mine.autoplay = true;
    mine.playsInline = true;
    mine.disableRemotePlayback = true;
    mine.preload = 'auto';
    const poster = xv.getAttribute('poster');
    if (poster) mine.poster = poster;
    mine.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:10;';
    mine.addEventListener('error', () => giveUp(holder, mine), true);
    for (const type of ['click', 'dblclick']) mine.addEventListener(type, (e) => e.stopPropagation());
    mine.src = src;
    if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    holder.setAttribute('data-xm-replaced', '1');
    holder.appendChild(mine);
  }

  function processGifs() {
    for (const xv of document.querySelectorAll('video:not([data-xm-own])')) {
      const src = xv.currentSrc || xv.src || '';
      if (!/\/tweet_video\//.test(src)) continue;
      const holder = xv.closest(PLAYER) || xv.closest('[data-testid="tweetPhoto"]') || xv.parentElement;
      if (!holder) continue;
      if (holder.getAttribute('data-xm-replaced') === '1' || holder.getAttribute('data-xm-failed') === '1') continue;
      replaceGif(holder, xv, src);
    }
  }

  function revert(selector) {
    for (const mine of document.querySelectorAll(selector)) {
      const holder = mine.parentElement;
      mine.remove();
      if (holder) holder.removeAttribute('data-xm-replaced');
    }
  }

  function process() {
    if (!OPTIONS.nativeVideo) revert('video[data-xm-own]:not([data-xm-gif])');
    if (!OPTIONS.gifsAsVideos) revert('video[data-xm-own][data-xm-gif]');

    if (OPTIONS.nativeVideo) {
      for (const player of document.querySelectorAll(PLAYER)) {
        if (player.getAttribute('data-xm-replaced') === '1' || player.getAttribute('data-xm-failed') === '1') continue;
        const entry = entryForPlayer(player);
        if (entry) replace(player, entry);
      }
    }
    if (OPTIONS.gifsAsVideos) processGifs();

    // keep X's own video quiet underneath ours
    for (const holder of document.querySelectorAll('[data-xm-replaced="1"]')) {
      for (const v of holder.querySelectorAll('video:not([data-xm-own])')) {
        if (!v.paused) v.pause();
        v.muted = true;
      }
    }
  }

  videoTick = process;
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  setInterval(schedule, 1500);
  schedule();
})();
