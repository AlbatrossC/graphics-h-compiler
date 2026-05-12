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

// PostHog Analytics (Numbers & Events only, Session Recordings disabled)
(function () {
  // Executing on all environments including localhost and vercel

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init('phc_IbbFwOf6SQ0Qa9EKKyGgkFliw6fgkEp6D2m9jCiM87T', {
    api_host: 'https://app.posthog.com',
    autocapture: true, // Captures all button clicks natively
    disable_session_recording: true, // We use Clarity for recordings
  });

  // Custom Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Core Execution Events
    document.addEventListener('compiler-run-start', () => {
      posthog.capture('run_code_clicked');
    });

    document.addEventListener('compiler-compile-success', () => {
      posthog.capture('code_compiled_success');
    });

    document.addEventListener('compiler-compilation-error', (e) => {
      posthog.capture('code_compiled_error', {
        error_message: e.detail?.content || 'Unknown error'
      });
    });

    // 2. Auth & User Events
    const googleBtn = document.getElementById('google-signin-btn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => {
        posthog.capture('user_login', { provider: 'google' });
      });
    }

    // 3. Settings Changes & Demos
    document.addEventListener('change', (e) => {
      const id = e.target.id;
      
      if (id === 'demo-select') {
        posthog.capture('demo_selected', { demo_name: e.target.value });
      }
      
      if (id && id.startsWith('settings-')) {
        let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        posthog.capture('setting_changed', { setting: id, value: val });
      }
    });

    // 4. Docs Usage
    const docsSearch = document.getElementById('docs-ref-search-input');
    if (docsSearch) {
      docsSearch.addEventListener('change', (e) => {
        if (e.target.value.trim()) {
          posthog.capture('docs_searched', { search_query: e.target.value.trim() });
        }
      });
    }

    // 5. Output / DOS
    const downloadTerminalBtn = document.getElementById('download-terminal-btn');
    if (downloadTerminalBtn) {
      downloadTerminalBtn.addEventListener('click', () => {
        posthog.capture('screenshot_downloaded');
      });
    }
  });
})();
