// Analytics & Tracking Scripts

(function () {
  var started = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };
  window.clarity = window.clarity || function () {
    (window.clarity.q = window.clarity.q || []).push(arguments);
  };

  function loadAnalytics() {
    if (started) return;
    started = true;

    var gaScript = document.createElement("script");
    gaScript.async = true;
    gaScript.src = "https://www.googletagmanager.com/gtag/js?id=G-7WDYZ2W2R0";
    document.head.appendChild(gaScript);

    window.gtag("js", new Date());
    window.gtag("config", "G-7WDYZ2W2R0");

    if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      var clarityScript = document.createElement("script");
      clarityScript.async = true;
      clarityScript.src = "https://www.clarity.ms/tag/up3p2m5ovd";
      document.head.appendChild(clarityScript);
    }
  }

  function scheduleAnalytics() {
    var startWhenIdle = function () {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(loadAnalytics, { timeout: 2000 });
      } else {
        window.setTimeout(loadAnalytics, 0);
      }
    };
    window.setTimeout(startWhenIdle, 2500);
  }

  if (document.readyState === "complete") {
    scheduleAnalytics();
  } else {
    window.addEventListener("load", scheduleAnalytics, { once: true });
  }

  ["pointerdown", "touchstart", "keydown"].forEach(function (eventName) {
    window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
  });
})();
