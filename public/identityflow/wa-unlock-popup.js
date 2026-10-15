/**
 * DivyaPrabha-themed "Unlock offer on WhatsApp" launcher.
 * Bottom-right FAB + compact offer card (not a centered green modal).
 * Requires visitor-tracker.js + window.__IDENTITYFLOW_TRACK__.endpoint
 */
(function () {
  var w = window;
  var cfg = w.__IDENTITYFLOW_TRACK__ || {};
  var origin = (cfg.endpoint || '').replace(/\/$/, '');
  if (!origin) return;

  var DISMISS_KEY = 'if_unlock_dismissed';
  var delayMs = (cfg.popupDelaySeconds != null ? cfg.popupDelaySeconds : 25) * 1000;

  // Brand tokens from divyaprabhafoods.com (maroon / cream / warm clay)
  var C = {
    maroon: '#5C1A1A',
    maroonDeep: '#3E1010',
    cream: '#FBF6EE',
    creamEdge: '#E8D9C4',
    clay: '#B4532A',
    ink: '#2A1810',
    muted: '#6E5648',
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
      '@keyframes ifUnlockIn{0%{opacity:0;transform:translate3d(18px,12px,0) scale(.92)}' +
      '100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}' +
      '@keyframes ifUnlockPulse{0%{box-shadow:0 0 0 0 rgba(92,26,26,.45)}' +
      '70%{box-shadow:0 0 0 16px rgba(92,26,26,0)}100%{box-shadow:0 0 0 0 rgba(92,26,26,0)}}' +
      '@keyframes ifUnlockBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}' +
      '@keyframes ifUnlockShine{0%{transform:translateX(-120%)}100%{transform:translateX(220%)}}' +
      '@keyframes ifUnlockBadge{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}' +
      '#if-unlock-root{position:fixed;z-index:99999;right:16px;bottom:20px;display:flex;flex-direction:column;' +
      'align-items:flex-end;gap:10px;font-family:Georgia,"Times New Roman",serif;pointer-events:none}' +
      '#if-unlock-root *{box-sizing:border-box}' +
      '#if-unlock-card{pointer-events:auto;width:min(292px,calc(100vw - 88px));background:linear-gradient(165deg,' +
      C.cream + ' 0%,#fff 55%,' +
      C.cream + ' 100%);border:1px solid ' +
      C.creamEdge + ';border-radius:18px 18px 6px 18px;padding:14px 14px 12px;' +
      'box-shadow:0 14px 40px rgba(62,16,16,.22),0 2px 0 rgba(255,255,255,.7) inset;' +
      'animation:ifUnlockIn .55s cubic-bezier(.22,1,.36,1) both;position:relative;overflow:hidden}' +
      '#if-unlock-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,' +
      C.clay + ',' +
      C.maroon + ')}' +
      '#if-unlock-close{position:absolute;top:6px;right:8px;border:0;background:transparent;color:' +
      C.muted + ';font-size:18px;line-height:1;cursor:pointer;padding:4px;font-family:system-ui,sans-serif}' +
      '#if-unlock-kicker{display:inline-flex;align-items:center;gap:6px;font-family:system-ui,-apple-system,sans-serif;' +
      'font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' +
      C.clay + ';margin:2px 24px 6px 0}' +
      '#if-unlock-badge{display:inline-block;background:' +
      C.maroon + ';color:#fff;font-size:9px;padding:2px 7px;border-radius:999px;animation:ifUnlockBadge 1.8s ease-in-out infinite}' +
      '#if-unlock-title{font-size:17px;line-height:1.25;font-weight:700;color:' +
      C.maroonDeep + ';margin:0 22px 6px 0}' +
      '#if-unlock-copy{font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;color:' +
      C.muted + ';margin:0 0 12px}' +
      '#if-unlock-cta{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:8px;' +
      'text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:700;' +
      'color:#fff;background:linear-gradient(135deg,' +
      C.maroon + ' 0%,' +
      C.clay + ' 100%);padding:11px 14px;border-radius:999px;' +
      'box-shadow:0 8px 18px rgba(92,26,26,.28);transition:transform .15s ease,filter .15s ease}' +
      '#if-unlock-cta:hover{filter:brightness(1.06);transform:translateY(-1px)}' +
      '#if-unlock-cta::after{content:"";position:absolute;top:0;bottom:0;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);' +
      'animation:ifUnlockShine 2.8s ease-in-out infinite}' +
      '#if-unlock-fab{pointer-events:auto;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;color:#fff;' +
      'background:radial-gradient(circle at 30% 25%,' +
      C.clay + ',' +
      C.maroon + ' 55%,' +
      C.maroonDeep + ');box-shadow:0 10px 24px rgba(62,16,16,.35);' +
      'animation:ifUnlockIn .5s .08s cubic-bezier(.22,1,.36,1) both,ifUnlockPulse 2.2s 1s ease-out infinite,ifUnlockBob 3s 1.2s ease-in-out infinite}' +
      '#if-unlock-fab svg{width:26px;height:26px;display:block}' +
      '#if-unlock-fab .if-dot{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;' +
      'background:' +
      C.clay + ';border:2px solid #fff;animation:ifUnlockBadge 1.4s ease-in-out infinite}' +
      '@media (max-width:480px){#if-unlock-root{right:12px;bottom:16px}#if-unlock-card{width:min(270px,calc(100vw - 80px))}}' +
      '@media (prefers-reduced-motion:reduce){#if-unlock-card,#if-unlock-fab,#if-unlock-badge,#if-unlock-cta::after,' +
      '#if-unlock-fab .if-dot{animation:none!important}}';
    document.head.appendChild(s);
  }

  function waIcon() {
    return (
      '<svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">' +
      '<path d="M16.01 3C9.39 3 4 8.37 4 14.97c0 2.1.55 4.14 1.6 5.95L4 29l8.3-1.55A12 12 0 0 0 16.01 27C22.63 27 28 21.63 28 15.03 28 8.37 22.63 3 16.01 3zm0 21.9c-1.76 0-3.48-.46-4.99-1.33l-.36-.2-4.93.92.94-4.8-.23-.38A9.86 9.86 0 0 1 6.1 15c0-5.45 4.45-9.88 9.91-9.88S25.9 9.55 25.9 15c0 5.45-4.44 9.9-9.89 9.9zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.46-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
      '</svg>'
    );
  }

  function show(data) {
    if (document.getElementById('if-unlock-root')) return;
    injectStyles();

    var root = document.createElement('div');
    root.id = 'if-unlock-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', data.offerText || 'WhatsApp offer');

    var card = document.createElement('div');
    card.id = 'if-unlock-card';
    card.innerHTML =
      '<button type="button" aria-label="Close" id="if-unlock-close">×</button>' +
      '<div id="if-unlock-kicker"><span id="if-unlock-badge">10% OFF</span> WhatsApp unlock</div>' +
      '<div id="if-unlock-title">' +
      (data.offerText || 'Unlock your offer on WhatsApp') +
      '</div>' +
      '<p id="if-unlock-copy">' +
      (data.consentText ||
        'Message us for your code. Reply STOP anytime.') +
      '</p>' +
      '<a id="if-unlock-cta" href="' +
      data.waUrl +
      '" target="_blank" rel="noopener">' +
      waIcon() +
      '<span>Unlock on WhatsApp</span></a>';

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'if-unlock-fab';
    fab.setAttribute('aria-label', 'Open WhatsApp offer');
    fab.innerHTML = waIcon() + '<span class="if-dot" aria-hidden="true"></span>';

    root.appendChild(card);
    root.appendChild(fab);
    document.body.appendChild(root);

    function close() {
      markDismissed();
      root.remove();
      if (w.VisitorTracker) w.VisitorTracker.track('popup_dismissed', { kind: 'wa_unlock' });
    }

    document.getElementById('if-unlock-close').onclick = close;
    fab.onclick = function () {
      var a = document.getElementById('if-unlock-cta');
      if (a) a.click();
    };
    document.getElementById('if-unlock-cta').onclick = function () {
      if (w.VisitorTracker) w.VisitorTracker.track('unlock_clicked', { ref: data.refCode });
    };
    if (w.VisitorTracker) w.VisitorTracker.track('popup_viewed', { kind: 'wa_unlock' });
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
