// Analytics & Tracking Scripts

// Google AdSense
(function () {
  var adScript = document.createElement("script");
  adScript.async = true;
  adScript.src =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6317839573120005";
  adScript.crossOrigin = "anonymous";
  document.head.appendChild(adScript);
})();

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
