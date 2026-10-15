/**
 * DEPRECATED — kept so old theme snippets still work after CDN refresh.
 * Prefer wa-unlock-widget.js (21st.dev-style floating chat widget).
 */
(function () {
  if (window.__IF_UNLOCK_WIDGET_LOADING__) return;
  window.__IF_UNLOCK_WIDGET_LOADING__ = true;
  var s = document.createElement('script');
  s.src = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      var m = src.match(/^(.*)\/wa-unlock-popup\.js(?:\?.*)?$/i);
      if (m) return m[1] + '/wa-unlock-widget.js?v=21st';
    }
    return 'https://whatsapp.arhamtechnology.com/identityflow/wa-unlock-widget.js?v=21st';
  })();
  s.defer = true;
  document.head.appendChild(s);
})();
