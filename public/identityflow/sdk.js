/**
 * IdentityFlow storefront SDK — theme app embed / script tag.
 * Consent-first: no events until identityflow:consentGranted is set,
 * except consent_updated itself.
 *
 * Config via window.__IDENTITYFLOW__ = { storeId, endpoint, signed?: boolean }
 */
(function () {
  var w = window;
  var cfg = w.__IDENTITYFLOW__ || {};
  var storeId = cfg.storeId;
  var endpoint = cfg.endpoint || "/api/v1/events/ingest";
  if (!storeId) return;

  var visitorKey = "if_vid";
  var sessionKey = "if_sid";
  var consentKey = "if_consent";

  function uuid() {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrSet(key, create) {
    try {
      var v = localStorage.getItem(key);
      if (v) return v;
      v = create();
      localStorage.setItem(key, v);
      return v;
    } catch (e) {
      return create();
    }
  }

  var visitorId = getOrSet(visitorKey, uuid);
  var sessionId = getOrSet(sessionKey, uuid);

  function hasConsent() {
    try {
      return localStorage.getItem(consentKey) === "1";
    } catch (e) {
      return false;
    }
  }

  function setConsent(granted) {
    try {
      localStorage.setItem(consentKey, granted ? "1" : "0");
    } catch (e) {}
    track("consent_updated", { granted: !!granted });
  }

  function track(eventName, payload) {
    var consentGranted = hasConsent();
    if (!consentGranted && eventName !== "consent_updated") return;

    var body = JSON.stringify({
      storeId: storeId,
      eventId: uuid(),
      eventName: eventName,
      visitorId: visitorId,
      sessionId: sessionId,
      consentGranted: consentGranted || eventName === "consent_updated",
      payload: payload || {},
      occurredAt: new Date().toISOString(),
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      } else {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
          mode: "cors",
        }).catch(function () {});
      }
    } catch (e) {}
  }

  w.IdentityFlow = {
    track: track,
    setConsent: setConsent,
    hasConsent: hasConsent,
    visitorId: visitorId,
    sessionId: sessionId,
  };

  if (hasConsent()) {
    track("session_started", { path: location.pathname });
    track("page_viewed", { path: location.pathname, title: document.title });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && hasConsent()) {
      track("page_viewed", { path: location.pathname, beacon: true });
    }
  });
})();
