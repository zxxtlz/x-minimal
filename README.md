# X minimal (Firefox / LibreWolf extension)

Minimal black, text-only skin for x.com (chat page included), the browser's own video player, bounce animations
and an options panel.

[**Install X minimal from addons.mozilla.org**](https://addons.mozilla.org/en-US/firefox/addon/x-minimal-theme/)

Narrow windows are supported: the sidebar becomes a compact scrollable top bar, the feed goes
full width, and post action rows, the gallery and the options panel all compact themselves.

## Install
- **Recommended:** [install the signed extension from AMO](https://addons.mozilla.org/en-US/firefox/addon/x-minimal-theme/).
- Try it from source: `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on...** -> pick `manifest.json`
  (or download the source ZIP from Releases). Temporary add-ons disappear when the browser closes.

Turn off the Stylus style and the Violentmonkey scripts for x.com first, otherwise everything loads twice.

## Options
Click **options** in the x.com sidebar (under "profile"), or open the add-on's preferences in `about:addons`.
Changes apply straight away.
- animate the background gradient (on/off)
- show the right sidebar (search, trends, who to follow)
- show the floating chat button / floating grok button
- show or hide each sidebar button separately (home, explore, notifications, messages, grok, bookmarks, communities,
  lists, premium, profile, creator studio, calls, more). Buttons appear/disappear immediately when you flip a switch,
  and stay hidden across X's re-renders.
- bounce when you like, repost or keep a post
- copy post links as: x.com (default), fxtwitter.com, vxtwitter.com, fixupx.com, nitter.net, twitter.com or your own domain.
  Choose "copy link" in a post's share menu and the link is copied with that domain.
- the browser's own video player, and the preferred quality
- an image guide at the bottom of the options panel (under "custom domain"); click it to enlarge
- post action labels (reply, repost, like, keep, share) are always visible, no hover needed; in the post detail view
  they wrap instead of clipping at the edge

## Keyboard shortcuts (like OldTwitter)
They work when you are not typing in a text box, in chat (/i/chat, /messages), in a dialog or menu, in the options
panel or in an image gallery. Physical keys are used, so they also work on a cyrillic layout. Handled keys never reach
X's own shortcuts.
- `w` / `s` select the previous / next post (the selected post gets a thin bar on its left) and move keyboard focus to
  that post's video controls; if it has a video the video starts playing (option: "play a post's video as soon as you
  select it")
- `space` plays / pauses the video you are currently looking at (the one `w` / `s` just focused), never one from an
  older post; on a post with only photos it opens a full-size image gallery, `enter` opens the post
- in the gallery: `left` / `right` or `a` / `d` (and `space`) browse the photos, `esc` closes it. Scroll the wheel over
  an image to zoom anywhere from 20% (500% zoomed out) to 800%; drag the picture to move your view of it as far as
  you like — there is no limit and nothing is clipped. The browser's native "drag the image file" gesture is disabled
  so the drag pans the view instead. The timeline behind the gallery cannot be scrolled (wheel, touch or scroll keys)
  while it is open, and your exact scroll position is preserved — opening or closing the gallery never jumps you back
  to the top of the page. The side arrows are overlay buttons and no longer take up space. Clicking an image shows the
  next one. Images are loaded at their original resolution when X provides one, with smaller sizes as a fallback.
- clicking a photo in **any** post that has only images opens that gallery directly — the post does not need to be
  selected. The post **never** opens from its images; click the post text, timestamp or buttons to open it.
- `l` like, `b` keep (bookmark), `t` repost (opens the repost menu), `r` reply
- `/` search (focuses the search box, or opens the explore page first), `n` write a post
- no shortcut fires in chat, so `w`, `s`, `/`, `n` etc. are all free for typing messages
The sidebar shows the keys: `write  n` and `search  /` (option: "show the shortcut keys in the sidebar").

## Video
For every video X shows, `main.js` finds the plain .mp4 files in X's own data and lays an ordinary
`<video controls>` over X's player: right-click -> open in new tab / save as / picture-in-picture all work.
Videos never autoplay (press play). X's own player is never modified: if a video cannot be matched, or the mp4 fails
to load, you simply get X's player.
GIFs are shown as videos too: a looping, muted, auto-starting `<video controls>`, so they have the video controls
(option: "show gifs as videos").
Videos pause when they scroll out of view (option: "pause videos when they scroll out of view"); gifs start again when
they come back. Videos in picture-in-picture or fullscreen are never paused.

## Files
- `theme.css` - the skin (layout rules switch off on chat pages, profile photo viewer is square)
- `main.js` - runs in the page: route flags, bounce, copy link, floating buttons, native video player
- `content.js`, `xm-settings.js` - settings, the sidebar "options" item and the panel
- `options.html`, `options.js` - the same panel as an add-on preferences page
