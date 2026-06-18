(function () {
  class GraphicsHEmbed {
    constructor(target, options = {}) {
      const host = typeof target === 'string' ? document.querySelector(target) : target;
      if (!host) {
        throw new Error('GraphicsHEmbed target not found');
      }

      this.host = host;
      this.baseUrl = (options.baseUrl || '').replace(/\/$/, '');
      this.scale = Number.isFinite(Number(options.scale)) && Number(options.scale) > 0 ? Number(options.scale) : 1;
      this.ready = false;
      this.pending = null;

      this.iframe = document.createElement('iframe');
      this.iframe.title = options.title || 'graphics.h compiler output';
      this.iframe.allow = 'clipboard-read; clipboard-write';
      this.iframe.style.width = `${Math.round(640 * this.scale)}px`;
      this.iframe.style.height = `${Math.round(480 * this.scale)}px`;
      this.iframe.style.maxWidth = '100%';
      this.iframe.style.border = '0';
      this.iframe.style.display = 'block';
      this.iframe.style.background = '#000';
      this.iframe.src = `${this.baseUrl}/embed?scale=${encodeURIComponent(this.scale)}`;

      this.host.innerHTML = '';
      this.host.appendChild(this.iframe);

      window.addEventListener('message', (event) => {
        if (event.source !== this.iframe.contentWindow) return;
        const data = event.data || {};
        if (data.type === 'EMBED_READY') {
          this.ready = true;
          if (this.pending) {
            const pending = this.pending;
            this.pending = null;
            this.runSnippet(pending.snippet, pending.options);
          }
        }
      });
    }

    runSnippet(snippet, options = {}) {
      const payload = {
        type: 'RUN_SNIPPET',
        snippet: String(snippet || ''),
        boilerplate: options.boilerplate !== false,
        focus: options.focus === true
      };

      if (!this.ready) {
        this.pending = { snippet: payload.snippet, options: { boilerplate: payload.boilerplate, focus: payload.focus } };
        return;
      }

      this.iframe.contentWindow.postMessage(payload, '*');
    }
  }

  window.GraphicsHEmbed = GraphicsHEmbed;
}());
