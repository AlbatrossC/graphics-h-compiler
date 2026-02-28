class GraphicsHEmbed {
    constructor(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) throw new Error(`Container ${selector} not found`);

        const baseUrl = options.baseUrl || 'https://graphics-h-compiler.vercel.app';
        this.targetOrigin = baseUrl;

        this.iframe = document.createElement('iframe');
        let url = baseUrl + '/embed';
        const params = new URLSearchParams();
        if (options.theme) params.append('theme', options.theme);
        if (params.toString()) url += '?' + params.toString();

        this.iframe.src = url;
        this.iframe.style.border = '0';
        this.iframe.style.display = 'block';
        this.iframe.style.background = '#000';
        this.container.appendChild(this.iframe);

        // Apply scale — just sets iframe width/height in pixels
        this.setScale(options.scale || 1);

        // Queue snippets until embed.html signals ready
        this.isReady = false;
        this.pendingRun = null;
        window.addEventListener('message', (e) => {
            if (e.source === this.iframe.contentWindow && e.data && e.data.type === 'EMBED_READY') {
                this.isReady = true;
                if (this.pendingRun) {
                    this._send(this.pendingRun.code, this.pendingRun.boilerplate);
                    this.pendingRun = null;
                }
            }
        });
    }

    runSnippet(code, boilerplate = true) {
        if (!this.isReady) {
            this.pendingRun = { code, boilerplate };
        } else {
            this._send(code, boilerplate);
        }
    }

    _send(code, boilerplate) {
        this.iframe.contentWindow.postMessage({
            type: 'RUN_SNIPPET',
            snippet: code,
            boilerplate: boilerplate
        }, this.targetOrigin);
    }

    setScale(scale) {
        const s = parseFloat(scale);
        this.iframe.width = Math.round(640 * s);
        this.iframe.height = Math.round(480 * s);
    }
}

window.GraphicsHEmbed = GraphicsHEmbed;
