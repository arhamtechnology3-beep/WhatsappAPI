/**
 * Minimal popup renderer for active IdentityFlow campaigns.
 * Loads campaigns from a public config endpoint later; for now merchants
 * inject window.__IDENTITYFLOW_CAMPAIGNS__ = [{ id, trigger, content, frequencyCap }]
 * Frequency cap + consent are also enforced when recording events.
 */
(function () {
  var w = window;
  if (!w.IdentityFlow || !w.IdentityFlow.hasConsent || !w.IdentityFlow.hasConsent()) return;
  var list = w.__IDENTITYFLOW_CAMPAIGNS__ || [];
  if (!list.length) return;

  var seenKey = "if_camp_seen";
  function seenMap() {
    try {
      return JSON.parse(localStorage.getItem(seenKey) || "{}");
    } catch (e) {
      return {};
    }
  }
  function markSeen(id) {
    var m = seenMap();
    m[id] = (m[id] || 0) + 1;
    try {
      localStorage.setItem(seenKey, JSON.stringify(m));
    } catch (e) {}
  }

  function show(campaign) {
    var seen = seenMap()[campaign.id] || 0;
    if (seen >= (campaign.frequencyCap || 1)) return;

    var root = document.createElement("div");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.style.cssText =
      "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)";
    var card = document.createElement("div");
    card.style.cssText =
      "background:#fff;color:#111;max-width:360px;width:90%;padding:20px;border-radius:12px;font-family:system-ui,sans-serif";
    var h = document.createElement("h2");
    h.textContent = (campaign.content && campaign.content.headline) || campaign.name || "Offer";
    h.style.margin = "0 0 8px";
    var p = document.createElement("p");
    p.textContent = (campaign.content && campaign.content.body) || "";
    p.style.margin = "0 0 16px";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.onclick = function () {
      document.body.removeChild(root);
      w.IdentityFlow.track("popup_dismissed", { campaignId: campaign.id });
    };
    var cta = document.createElement("button");
    cta.type = "button";
    cta.textContent = (campaign.content && campaign.content.cta) || "Continue";
    cta.onclick = function () {
      w.IdentityFlow.track("campaign_converted", { campaignId: campaign.id });
      document.body.removeChild(root);
      if (campaign.content && campaign.content.href) location.href = campaign.content.href;
    };
    row.appendChild(close);
    row.appendChild(cta);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(row);
    root.appendChild(card);
    document.body.appendChild(root);
    markSeen(campaign.id);
    w.IdentityFlow.track("popup_viewed", { campaignId: campaign.id });
  }

  // first_visit / returning heuristics
  var isReturn = false;
  try {
    isReturn = localStorage.getItem("if_seen_before") === "1";
    localStorage.setItem("if_seen_before", "1");
  } catch (e) {}

  list.forEach(function (c) {
    var t = (c.trigger && c.trigger.type) || "first_visit";
    if (t === "first_visit" && !isReturn) show(c);
    if (t === "returning_visitor" && isReturn) show(c);
  });
})();
