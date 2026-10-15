/**
 * OTP-free "Unlock offer on WhatsApp" popup.
 * Requires visitor-tracker.js (window.VisitorTracker) and:
 *   window.__IDENTITYFLOW_TRACK__.endpoint
 */
(function () {
  var w = window;
  var cfg = w.__IDENTITYFLOW_TRACK__ || {};
  var origin = (cfg.endpoint || '').replace(/\/$/, '');
  if (!origin) return;

  var DISMISS_KEY = 'if_unlock_dismissed';
  var delayMs = (cfg.popupDelaySeconds != null ? cfg.popupDelaySeconds : 25) * 1000;

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

  function show(data) {
    if (document.getElementById('if-unlock-popup')) return;
    var wrap = document.createElement('div');
    wrap.id = 'if-unlock-popup';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', data.offerText || 'WhatsApp offer');
    wrap.style.cssText =
      'position:fixed;z-index:99999;inset:auto 16px 16px 16px;max-width:360px;margin:0 auto;left:0;right:0;' +
      'background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px 18px;box-shadow:0 8px 28px rgba(0,0,0,.18);' +
      'font-family:system-ui,-apple-system,sans-serif;';
    wrap.innerHTML =
      '<button type="button" aria-label="Close" id="if-unlock-close" style="position:absolute;top:8px;right:10px;border:0;background:transparent;font-size:20px;cursor:pointer;line-height:1">×</button>' +
      '<div style="font-size:17px;font-weight:700;margin:4px 28px 8px 0;color:#1a1a1a">' +
      (data.offerText || 'Unlock your offer on WhatsApp') +
      '</div>' +
      '<p style="font-size:13px;color:#555;margin:0 0 12px;line-height:1.4">' +
      (data.consentText || '') +
      '</p>' +
      '<a id="if-unlock-cta" href="' +
      data.waUrl +
      '" target="_blank" rel="noopener" style="display:block;text-align:center;background:#25D366;color:#fff;text-decoration:none;font-weight:600;padding:12px 14px;border-radius:8px">Open WhatsApp</a>';
    document.body.appendChild(wrap);
    document.getElementById('if-unlock-close').onclick = function () {
      markDismissed();
      wrap.remove();
      if (w.VisitorTracker) w.VisitorTracker.track('popup_dismissed', { kind: 'wa_unlock' });
    };
    document.getElementById('if-unlock-cta').onclick = function () {
      if (w.VisitorTracker) w.VisitorTracker.track('unlock_clicked', { ref: data.refCode });
    };
    if (w.VisitorTracker) w.VisitorTracker.track('popup_viewed', { kind: 'wa_unlock' });
  }

  function maybeShow() {
    if (dismissed() || identified()) return;
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

  // Exit intent (desktop)
  document.addEventListener('mouseout', function (e) {
    if (e.clientY > 0) return;
    maybeShow();
  });
})();
