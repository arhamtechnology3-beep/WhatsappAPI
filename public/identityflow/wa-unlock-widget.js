/**
 * DivyaPrabha unlock — 21st.dev-style floating chat widget.
 * Pattern: compact message preview to the LEFT of a circular FAB.
 * Load: .../identityflow/wa-unlock-widget.js (new URL = no stale cache)
 */
(function () {
  var w = window;
  var cfg = w.__IDENTITYFLOW_TRACK__ || {};
  var origin = (cfg.endpoint || '').replace(/\/$/, '');
  if (!origin) return;

  var DISMISS_KEY = 'if_unlock_dismissed';
  var delayMs = (cfg.popupDelaySeconds != null ? cfg.popupDelaySeconds : 25) * 1000;
  var VERSION = '21st-v1';

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
    if (document.getElementById('if-uw-styles')) return;
    var s = document.createElement('style');
    s.id = 'if-uw-styles';
    s.textContent =
      '@keyframes ifUwIn{from{opacity:0;transform:translate3d(16px,8px,0) scale(.96)}' +
      'to{opacity:1;transform:translate3d(0,0,0) scale(1)}}' +
      '@keyframes ifUwFabIn{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}' +
      '@keyframes ifUwPing{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.1);opacity:0}}' +
      '@keyframes ifUwSoft{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
      '#if-uw{position:fixed;z-index:99999;right:max(16px,env(safe-area-inset-right));' +
      'bottom:max(20px,env(safe-area-inset-bottom));display:flex;flex-direction:row;align-items:flex-end;' +
      'gap:10px;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#if-uw *{box-sizing:border-box}' +
      '#if-uw-preview{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;max-width:min(280px,calc(100vw - 90px));' +
      'padding:12px 12px 12px 12px;border-radius:18px;background:rgba(255,252,248,.92);' +
      'backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);' +
      'border:1px solid rgba(107,30,30,.12);box-shadow:0 18px 50px -18px rgba(42,16,12,.45),0 0 0 1px rgba(255,255,255,.6) inset;' +
      'animation:ifUwIn .5s cubic-bezier(.16,1,.3,1) both;transform-origin:bottom right}' +
      '#if-uw-avatar{flex:0 0 auto;width:36px;height:36px;border-radius:999px;display:grid;place-items:center;' +
      'background:linear-gradient(145deg,#8B2E2E,#4A1212);color:#fff;font-size:11px;font-weight:800;letter-spacing:.02em;' +
      'box-shadow:0 4px 12px rgba(74,18,18,.3)}' +
      '#if-uw-msg{min-width:0;flex:1;padding-top:1px}' +
      '#if-uw-name{margin:0;font-size:11px;font-weight:650;color:#6B1E1E;opacity:.85}' +
      '#if-uw-text{margin:2px 0 8px;font-size:13px;line-height:1.35;font-weight:550;color:#2A1810;letter-spacing:-.01em}' +
      '#if-uw-actions{display:flex;align-items:center;gap:6px}' +
      '#if-uw-cta{appearance:none;border:0;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;' +
      'height:30px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:650;color:#fff;' +
      'background:#6B1E1E;box-shadow:0 8px 16px -8px rgba(107,30,30,.7);transition:transform .15s ease,background .15s ease}' +
      '#if-uw-cta:hover{background:#4A1212;transform:translateY(-1px)}' +
      '#if-uw-cta svg{width:12px;height:12px}' +
      '#if-uw-dismiss{appearance:none;border:0;background:transparent;cursor:pointer;font-size:11px;font-weight:550;' +
      'color:#7A5E4E;padding:4px 6px;border-radius:6px}' +
      '#if-uw-dismiss:hover{background:rgba(107,30,30,.06)}' +
      '#if-uw-fab-wrap{pointer-events:auto;position:relative;width:56px;height:56px;flex:0 0 auto}' +
      '#if-uw-ping{position:absolute;inset:0;border-radius:999px;background:rgba(107,30,30,.35);animation:ifUwPing 2s ease-out infinite}' +
      '#if-uw-fab{position:relative;width:56px;height:56px;border:0;border-radius:999px;cursor:pointer;color:#fff;' +
      'display:grid;place-items:center;background:linear-gradient(160deg,#C45C2A 0%,#6B1E1E 48%,#3E1010 100%);' +
      'box-shadow:0 14px 28px -10px rgba(62,16,16,.55),0 0 0 1px rgba(255,255,255,.12) inset;' +
      'animation:ifUwFabIn .45s cubic-bezier(.16,1,.3,1) both,ifUwSoft 3s 1s ease-in-out infinite}' +
      '#if-uw-fab svg{width:24px;height:24px}' +
      '#if-uw-badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:18px;padding:0 5px;border-radius:999px;' +
      'background:#fff;color:#6B1E1E;font-size:9px;font-weight:800;line-height:18px;text-align:center;' +
      'border:1px solid rgba(107,30,30,.15);box-shadow:0 4px 10px rgba(0,0,0,.12)}' +
      '@media (max-width:420px){#if-uw{right:12px;bottom:14px}#if-uw-preview{max-width:calc(100vw - 86px)}}' +
      '@media (prefers-reduced-motion:reduce){#if-uw-preview,#if-uw-fab,#if-uw-ping{animation:none!important}}';
    document.head.appendChild(s);
  }

  function waSvg() {
    return (
      '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">' +
      '<path d="M16.01 3C9.39 3 4 8.37 4 14.97c0 2.1.55 4.14 1.6 5.95L4 29l8.3-1.55A12 12 0 0 0 16.01 27C22.63 27 28 21.63 28 15.03 28 8.37 22.63 3 16.01 3zm0 21.9c-1.76 0-3.48-.46-4.99-1.33l-.36-.2-4.93.92.94-4.8-.23-.38A9.86 9.86 0 0 1 6.1 15c0-5.45 4.45-9.88 9.91-9.88S25.9 9.55 25.9 15c0 5.45-4.44 9.9-9.89 9.9zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.46-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
      '</svg>'
    );
  }

  function show(data) {
    if (document.getElementById('if-uw')) return;
    var waUrl = String(data.waUrl || '');
    if (!/^https:\/\/wa\.me\//.test(waUrl)) return;

    injectStyles();

    var offer = String(data.offerText || 'Unlock 10% OFF on WhatsApp');
    if (offer.length > 48) offer = offer.slice(0, 46) + '…';

    var root = document.createElement('div');
    root.id = 'if-uw';
    root.setAttribute('data-version', VERSION);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', offer);

    var preview = document.createElement('div');
    preview.id = 'if-uw-preview';
    preview.innerHTML =
      '<div id="if-uw-avatar" aria-hidden="true">DP</div>' +
      '<div id="if-uw-msg">' +
      '<p id="if-uw-name">DivyaPrabha</p>' +
      '<p id="if-uw-text"></p>' +
      '<div id="if-uw-actions">' +
      '<a id="if-uw-cta" target="_blank" rel="noopener">' +
      waSvg() +
      '<span>Get code</span></a>' +
      '<button type="button" id="if-uw-dismiss">Not now</button>' +
      '</div></div>';
    preview.querySelector('#if-uw-text').textContent = offer;
    preview.querySelector('#if-uw-cta').setAttribute('href', waUrl);

    var fabWrap = document.createElement('div');
    fabWrap.id = 'if-uw-fab-wrap';
    fabWrap.innerHTML =
      '<span id="if-uw-ping" aria-hidden="true"></span>' +
      '<button type="button" id="if-uw-fab" aria-label="Open WhatsApp offer">' +
      waSvg() +
      '<span id="if-uw-badge">10%</span></button>';

    root.appendChild(preview);
    root.appendChild(fabWrap);
    document.body.appendChild(root);

    var collapseTimer = null;
    function hidePreview() {
      if (preview && preview.parentNode) preview.remove();
    }
    function armCollapseTimer() {
      if (collapseTimer) clearTimeout(collapseTimer);
      collapseTimer = setTimeout(function () {
        if (document.getElementById('if-uw-preview')) hidePreview();
      }, 9000);
    }

    document.getElementById('if-uw-dismiss').onclick = function () {
      if (collapseTimer) clearTimeout(collapseTimer);
      hidePreview();
      markDismissed();
      if (w.VisitorTracker) w.VisitorTracker.track('popup_dismissed', { kind: 'wa_unlock' });
    };
    document.getElementById('if-uw-fab').onclick = function () {
      var a = document.getElementById('if-uw-cta');
      if (a) {
        a.click();
        return;
      }
      // Preview closed — reopen briefly
      if (!document.getElementById('if-uw-preview')) {
        root.insertBefore(preview, fabWrap);
        armCollapseTimer();
      }
    };
    document.getElementById('if-uw-cta').onclick = function () {
      if (w.VisitorTracker) w.VisitorTracker.track('unlock_clicked', { ref: data.refCode });
    };

    if (w.VisitorTracker) w.VisitorTracker.track('popup_viewed', { kind: 'wa_unlock', ui: VERSION });

    armCollapseTimer();
  }

  function maybeShow() {
    if (dismissed() || identified()) return;
    if (document.getElementById('if-uw')) return;
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
