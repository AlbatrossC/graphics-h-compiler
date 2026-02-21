// Analytics & Tracking Scripts

// Google Analytics
(function () {
  var gaScript = document.createElement("script");
  gaScript.async = true;
  gaScript.src =
    "https://www.googletagmanager.com/gtag/js?id=G-7WDYZ2W2R0";
  document.head.appendChild(gaScript);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", "G-7WDYZ2W2R0");
})();

// Microsoft Clarity
(function (c, l, a, r, i, t, y) {
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
  c[a] =
    c[a] ||
    function () {
      (c[a].q = c[a].q || []).push(arguments);
    };
  t = l.createElement(r);
  t.async = 1;
  t.src = "https://www.clarity.ms/tag/" + i;
  t.onerror = function () { }; // Silence blocked errors locally
  y = l.getElementsByTagName(r)[0];
  y.parentNode.insertBefore(t, y);
})(window, document, "clarity", "script", "up3p2m5ovd");


// Vercel Web Analytics
(function () {
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
  window.va =
    window.va ||
    function () {
      (window.vaq = window.vaq || []).push(arguments);
    };

  var vaScript = document.createElement("script");
  vaScript.defer = true;
  vaScript.src = "/_vercel/insights/script.js";
  vaScript.onerror = function () { }; // Silence blocked errors locally
  document.head.appendChild(vaScript);
})();
