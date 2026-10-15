/**
 * IdentityFlow visitor tracker v2 — first-party events to the CRM.
 *
 * Load on every storefront page:
 *   <script>
 *     window.__IDENTITYFLOW_TRACK__ = {
 *       endpoint: 'https://whatsapp.arhamtechnology.com',
 *       shopifyCustomerId: {{ customer.id | json }},
 *       shopifyCustomerSig: {{ customer.id | hmac_sha256: theme_secret | json }}
 *     };
 *   </script>
 *   <script src="https://whatsapp.arhamtechnology.com/identityflow/visitor-tracker.js" defer></script>
 *
 * No fingerprinting. No direct Supabase writes. Honours Shopify Customer Privacy.
 */
(function () {
  var w = window;
  var cfg = w.__IDENTITYFLOW_TRACK__ || {};
  var origin = (cfg.endpoint || '').replace(/\/$/, '') || '';
  if (!origin && typeof location !== 'undefined') {
    // Same-origin only when hosted on the CRM; theme always sets endpoint.
    origin = '';
  }
  var trackUrl = origin + '/api/v1/track';
  var identifyUrl = origin + '/api/v1/track/identify';

  var VISITOR_KEY = 'cr_visitor_id';
  var SESSION_KEY = 'cr_session_id';
  var CONSENT_KEY = 'if_consent';
  var QUEUE = [];
  var flushTimer = null;

  function uuid() {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function cookieGet(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function cookieSet(name, value, days) {
    var max = days ? '; max-age=' + days * 86400 : '';
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      max +
      '; path=/; SameSite=Lax';
  }

  function getOrSetVisitor() {
    var v = cookieGet(VISITOR_KEY) || null;
    try {
      v = v || localStorage.getItem(VISITOR_KEY);
    } catch (e) {}
    if (!v) v = uuid();
    cookieSet(VISITOR_KEY, v, 365);
    try {
      localStorage.setItem(VISITOR_KEY, v);
    } catch (e) {}
    return v;
  }

  function getOrSetSession() {
    try {
      var s = sessionStorage.getItem(SESSION_KEY);
      if (s) return s;
      s = uuid();
      sessionStorage.setItem(SESSION_KEY, s);
      return s;
    } catch (e) {
      return uuid();
    }
  }

  function analyticsAllowed() {
    try {
      if (w.Shopify && w.Shopify.customerPrivacy) {
        if (typeof w.Shopify.customerPrivacy.analyticsProcessingAllowed === 'function') {
          return !!w.Shopify.customerPrivacy.analyticsProcessingAllowed();
        }
      }
    } catch (e) {}
    try {
      return localStorage.getItem(CONSENT_KEY) !== '0';
    } catch (e) {
      return true;
    }
  }

  var visitorId = getOrSetVisitor();
  var sessionId = getOrSetSession();

  function stripQuery(url) {
    try {
      var u = new URL(url, location.origin);
      return u.origin + u.pathname;
    } catch (e) {
      return String(url || '').split('?')[0];
    }
  }

  function enqueue(eventName, payload) {
    if (!analyticsAllowed() && eventName !== 'consent_updated') return;
    QUEUE.push({
      eventId: uuid(),
      eventName: eventName,
      visitorId: visitorId,
      sessionId: sessionId,
      consentGranted: analyticsAllowed() || eventName === 'consent_updated',
      payload: payload || {},
      occurredAt: new Date().toISOString(),
    });
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 400);
    }
  }

  function flush() {
    flushTimer = null;
    if (!QUEUE.length || !origin) return;
    var batch = QUEUE.splice(0, 25);
    var body = JSON.stringify({ events: batch });
    // Always use fetch with credentials:'omit'. Cross-origin sendBeacon
    // attaches cookies and fails CORS when Allow-Credentials is unset.
    try {
      fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body,
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).catch(function () {});
    } catch (e) {}
  }

  function identify(extra) {
    if (!origin) return;
    var body = Object.assign(
      {
        visitorId: visitorId,
        sessionId: sessionId,
      },
      extra || {},
    );
    try {
      fetch(identifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).catch(function () {});
    } catch (e) {}
  }

  // Tagged WhatsApp link (?wcid=)
  try {
    var params = new URLSearchParams(location.search);
    var wcid = params.get('wcid');
    if (wcid) {
      identify({ wcid: wcid });
      params.delete('wcid');
      var clean =
        location.pathname +
        (params.toString() ? '?' + params.toString() : '') +
        location.hash;
      if (w.history && w.history.replaceState) {
        w.history.replaceState({}, '', clean);
      }
    }
  } catch (e) {}

  // Signed logged-in Shopify customer
  if (cfg.shopifyCustomerId && cfg.shopifyCustomerSig) {
    identify({
      shopifyCustomerId: String(cfg.shopifyCustomerId),
      shopifyCustomerSig: String(cfg.shopifyCustomerSig),
    });
  }

  // Keep cart attribute in sync for order webhooks
  function syncCartAttr() {
    try {
      fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: { dp_visitor_id: visitorId, dp_session_id: sessionId },
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }
  syncCartAttr();

  enqueue('session_started', { path: location.pathname });
  enqueue('page_view', { path: location.pathname, url: stripQuery(location.href), title: document.title });

  // Product page
  try {
    var ctx = w.ShopifyTemplateContext || w.meta || {};
    var product = ctx.product || (w.meta && w.meta.product) || null;
    if (product && (product.id || product.handle)) {
      enqueue('product_view', {
        product_id: product.id ? String(product.id) : undefined,
        handle: product.handle,
        title: product.title,
        price: product.price,
        url: stripQuery(location.href),
      });
    }
  } catch (e) {}

  // Hook fetch/XHR for cart changes (lightweight)
  function onCartMutation(type, detail) {
    enqueue(type, detail || {});
  }

  try {
    var origFetch = w.fetch;
    if (typeof origFetch === 'function') {
      w.fetch = function () {
        var args = arguments;
        var url = String((args[0] && args[0].url) || args[0] || '');
        return origFetch.apply(this, args).then(function (res) {
          if (/\/cart\/(add|change|update|clear)/.test(url)) {
            onCartMutation(
              /clear/.test(url) ? 'remove_from_cart' : /add/.test(url) ? 'add_to_cart' : 'add_to_cart',
              { path: location.pathname },
            );
            syncCartAttr();
          }
          return res;
        });
      };
    }
  } catch (e) {}

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  w.addEventListener('pagehide', flush);

  w.VisitorTracker = {
    visitorId: visitorId,
    sessionId: sessionId,
    track: enqueue,
    flush: flush,
    identify: identify,
    setConsent: function (granted) {
      try {
        localStorage.setItem(CONSENT_KEY, granted ? '1' : '0');
      } catch (e) {}
      enqueue('consent_updated', { granted: !!granted });
      flush();
    },
    resolveIdentity: function (phone, email, name) {
      if (!origin) return;
      try {
        fetch(origin + '/api/shopify/capture-visitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone,
            email: email,
            name: name,
            visitor_id: visitorId,
            marketing_opt_in: false,
          }),
          mode: 'cors',
          credentials: 'omit',
        }).catch(function () {});
      } catch (e) {}
    },
  };
})();
