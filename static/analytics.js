// I am tracking your Ass

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
  c[a] =
    c[a] ||
    function () {
      (c[a].q = c[a].q || []).push(arguments);
    };
  t = l.createElement(r);
  t.async = 1;
  t.src = "https://www.clarity.ms/tag/" + i;
  y = l.getElementsByTagName(r)[0];
  y.parentNode.insertBefore(t, y);
})(window, document, "clarity", "script", "up3p2m5ovd");


// Vercel Web Analytics
(function () {
  window.va =
    window.va ||
    function () {
      (window.vaq = window.vaq || []).push(arguments);
    };

  var vaScript = document.createElement("script");
  vaScript.defer = true;
  vaScript.src = "/_vercel/insights/script.js";
  document.head.appendChild(vaScript);
})();

// Smartlook - Canvas Recording Support
(function () {
  window.smartlook = window.smartlook || function () {
    window.smartlook.api.push(arguments);
  };
  window.smartlook.api = new Array();
  
  var slScript = document.createElement('script');
  slScript.async = true;
  slScript.type = 'text/javascript';
  slScript.charset = 'utf-8';
  slScript.src = 'https://web-sdk.smartlook.com/recorder.js';
  
  slScript.onload = function () {
    if (window.smartlook) {
      smartlook('init', '330b62a8ee9fe45ad617f570fbe2ec0e1abd164e', { region: 'eu' });
      console.log('[Analytics] Smartlook initialized for canvas recording');
    }
  };
  
  slScript.onerror = function () {
    console.warn('[Analytics] Smartlook failed to load');
  };
  
  var head = document.getElementsByTagName('head')[0];
  head.appendChild(slScript);
})();