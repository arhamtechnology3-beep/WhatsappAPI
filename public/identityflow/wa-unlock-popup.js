/**
 * DivyaPrabha unlock launcher — chat-widget style.
 * Bottom-right FAB + tiny speech bubble (not a large modal).
 */
(function () {
  var w = window;
  var cfg = w.__IDENTITYFLOW_TRACK__ || {};
  var origin = (cfg.endpoint || '').replace(/\/$/, '');
  if (!origin) return;

  var DISMISS_KEY = 'if_unlock_dismissed';
  var delayMs = (cfg.popupDelaySeconds != null ? cfg.popupDelaySeconds : 25) * 1000;

  var C = {
    maroon: '#6B1E1E',
    deep: '#4A1212',
    cream: '#FFF9F2',
    line: '#E8D5C0',
    clay: '#C45C2A',
    muted: '#7A5E4E',
  };

  function identified() {
    try {
      return !!localStorage.getItem('if_identified');
    } catch (e) {
      return false;
    }
  }
  function dismissed() {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function markDismissed() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById('if-unlock-styles')) return;
    var s = document.createElement('style');
    s.id = 'if-unlock-styles';
    s.textContent =
      '@keyframes ifFabPop{0%{opacity:0;transform:scale(.4)}60%{transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}' +
      '@keyframes ifFabRing{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.85);opacity:0}}' +
      '@keyframes ifBubbleIn{0%{opacity:0;transform:translate3d(12px,10px,0) scale(.85)}' +
      '100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}' +
      '@keyframes ifNudge{0%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}60%{transform:translateY(-2px)}}' +
      '#if-unlock-root{position:fixed;z-index:99999;right:14px;bottom:18px;display:flex;flex-direction:column;' +
      'align-items:flex-end;gap:8px;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '#if-unlock-root *{box-sizing:border-box}' +
      '#if-unlock-bubble{pointer-events:auto;position:relative;width:min(228px,calc(100vw - 78px));' +
      'background:' +
      C.cream + ';border:1px solid ' +
      C.line + ';border-radius:16px 16px 4px 16px;padding:11px 12px 10px;' +
      'box-shadow:0 12px 32px rgba(74,18,18,.2);animation:ifBubbleIn .45s cubic-bezier(.22,1.2,.36,1) both}' +
      '#if-unlock-bubble::after{content:"";position:absolute;right:18px;bottom:-7px;width:12px;height:12px;' +
      'background:' +
      C.cream + ';border-right:1px solid ' +
      C.line + ';border-bottom:1px solid ' +
      C.line + ';transform:rotate(45deg)}' +
      '#if-unlock-close{position:absolute;top:4px;right:6px;border:0;background:transparent;color:' +
      C.muted + ';font-size:16px;line-height:1;cursor:pointer;padding:4px;opacity:.7}' +
      '#if-unlock-close:hover{opacity:1}' +
      '#if-unlock-row{display:flex;align-items:flex-start;gap:8px;padding-right:14px}' +
      '#if-unlock-emoji{flex:0 0 auto;width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(145deg,' +
      C.clay + ',' +
      C.maroon + ');color:#fff;font-size:13px;font-weight:800;box-shadow:0 4px 10px rgba(107,30,30,.25)}' +
      '#if-unlock-body{min-width:0;flex:1}' +
      '#if-unlock-title{margin:0 0 2px;font-size:13px;font-weight:700;line-height:1.25;color:' +
      C.deep + ';letter-spacing:-.01em}' +
      '#if-unlock-sub{margin:0 0 8px;font-size:11px;line-height:1.35;color:' +
      C.muted + '}' +
      '#if-unlock-cta{display:inline-flex;align-items:center;gap:5px;text-decoration:none;font-size:12px;font-weight:700;' +
      'color:#fff;background:' +
      C.maroon + ';padding:7px 11px;border-radius:999px;' +
      'box-shadow:0 6px 14px rgba(107,30,30,.28);transition:transform .12s ease,background .12s ease}' +
      '#if-unlock-cta:hover{background:' +
      C.deep + ';transform:translateY(-1px)}' +
      '#if-unlock-cta svg{width:13px;height:13px;flex:0 0 auto}' +
      '#if-unlock-fab-wrap{pointer-events:auto;position:relative;width:54px;height:54px}' +
      '#if-unlock-ring{position:absolute;inset:0;border-radius:50%;border:2px solid ' +
      C.maroon + ';animation:ifFabRing 2s ease-out infinite;pointer-events:none}' +
      '#if-unlock-fab{position:relative;width:54px;height:54px;border:0;border-radius:50%;cursor:pointer;color:#fff;' +
      'background:linear-gradient(145deg,' +
      C.clay + ' 0%,' +
      C.maroon + ' 55%,' +
      C.deep + ' 100%);' +
      'box-shadow:0 10px 22px rgba(74,18,18,.35);animation:ifFabPop .5s cubic-bezier(.22,1.2,.36,1) both,ifNudge 2.6s 1s ease-in-out infinite;' +
      'display:flex;align-items:center;justify-content:center}' +
      '#if-unlock-fab svg{width:24px;height:24px;display:block}' +
      '#if-unlock-fab .if-pct{position:absolute;top:-3px;right:-4px;min-width:22px;height:18px;padding:0 4px;' +
      'border-radius:9px;background:#fff;color:' +
      C.maroon + ';font-size:9px;font-weight:800;line-height:18px;text-align:center;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.18);border:1px solid ' +
      C.line + '}' +
      '@media (max-width:480px){#if-unlock-root{right:12px;bottom:14px}#if-unlock-bubble{width:min(210px,calc(100vw - 74px))}}' +
      '@media (prefers-reduced-motion:reduce){#if-unlock-bubble,#if-unlock-fab,#if-unlock-ring{animation:none!important}}';
    document.head.appendChild(s);
  }

  function waSvg() {
    return (
      '<svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">' +
      '<path d="M16.01 3C9.39 3 4 8.37 4 14.97c0 2.1.55 4.14 1.6 5.95L4 29l8.3-1.55A12 12 0 0 0 16.01 27C22.63 27 28 21.63 28 15.03 28 8.37 22.63 3 16.01 3zm0 21.9c-1.76 0-3.48-.46-4.99-1.33l-.36-.2-4.93.92.94-4.8-.23-.38A9.86 9.86 0 0 1 6.1 15c0-5.45 4.45-9.88 9.91-9.88S25.9 9.55 25.9 15c0 5.45-4.44 9.9-9.89 9.9zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.46-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
      '</svg>'
    );
  }

  function shortOffer(text) {
    var t = String(text || 'Unlock 10% OFF');
    if (t.length > 42) t = t.slice(0, 40) + '…';
    return t;
  }

  function show(data) {
    if (document.getElementById('if-unlock-root')) return;
    injectStyles();

    var root = document.createElement('div');
    root.id = 'if-unlock-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', data.offerText || 'WhatsApp offer');

    var bubble = document.createElement('div');
    bubble.id = 'if-unlock-bubble';
    bubble.hidden = true;
    bubble.innerHTML =
      '<button type="button" aria-label="Close" id="if-unlock-close">×</button>' +
      '<div id="if-unlock-row">' +
      '<div id="if-unlock-emoji" aria-hidden="true">%</div>' +
      '<div id="if-unlock-body">' +
      '<p id="if-unlock-title">' +
      shortOffer(data.offerText) +
      '</p>' +
      '<p id="if-unlock-sub">Tap to get your code on WhatsApp</p>' +
      '<a id="if-unlock-cta" href="' +
      data.waUrl +
      '" target="_blank" rel="noopener">' +
      waSvg() +
      '<span>Get code</span></a>' +
      '</div></div>';

    var wrap = document.createElement('div');
    wrap.id = 'if-unlock-fab-wrap';
    wrap.innerHTML =
      '<span id="if-unlock-ring" aria-hidden="true"></span>' +
      '<button type="button" id="if-unlock-fab" aria-label="Open WhatsApp offer" aria-expanded="false">' +
      waSvg() +
      '<span class="if-pct">10%</span></button>';

    root.appendChild(bubble);
    root.appendChild(wrap);
    document.body.appendChild(root);

    var fab = document.getElementById('if-unlock-fab');
    var open = false;

    function setOpen(v) {
      open = v;
      bubble.hidden = !v;
      fab.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (v && w.VisitorTracker) {
        w.VisitorTracker.track('popup_viewed', { kind: 'wa_unlock' });
      }
    }

    function closeAll() {
      markDismissed();
      root.remove();
      if (w.VisitorTracker) w.VisitorTracker.track('popup_dismissed', { kind: 'wa_unlock' });
    }

    document.getElementById('if-unlock-close').onclick = function (e) {
      e.stopPropagation();
      closeAll();
    };
    fab.onclick = function () {
      if (!open) {
        setOpen(true);
        return;
      }
      var a = document.getElementById('if-unlock-cta');
      if (a) a.click();
    };
    document.getElementById('if-unlock-cta').onclick = function () {
      if (w.VisitorTracker) w.VisitorTracker.track('unlock_clicked', { ref: data.refCode });
    };

    // FAB first, then auto-open the tiny bubble (chat-widget pattern)
    setTimeout(function () {
      if (document.getElementById('if-unlock-root')) setOpen(true);
    }, 700);
  }

  function maybeShow() {
    if (dismissed() || identified()) return;
    if (document.getElementById('if-unlock-root')) return;
    var vid = (w.VisitorTracker && w.VisitorTracker.visitorId) || null;
    var sid = (w.VisitorTracker && w.VisitorTracker.sessionId) || null;
    if (!vid) return;
    fetch(origin + '/api/v1/capture/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: vid, sessionId: sid }),
      mode: 'cors',
      credentials: 'omit',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (res.ok && res.j && res.j.waUrl) show(res.j);
      })
      .catch(function () {});
  }

  setTimeout(maybeShow, Math.max(0, delayMs));
  document.addEventListener('mouseout', function (e) {
    if (e.clientY > 0) return;
    maybeShow();
  });
})();
