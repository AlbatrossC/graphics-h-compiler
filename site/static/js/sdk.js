const GRAPHICSH_SDK_ORIGIN = (() => {
    const scriptEl = document.currentScript;
    if (scriptEl && scriptEl.src) {
        return new URL(scriptEl.src, window.location.href).origin;
    }
    return window.location.origin;
})();

class GraphicsHEmbed {
    constructor(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) throw new Error(`Container ${selector} not found`);

        const baseUrl = options.baseUrl || GRAPHICSH_SDK_ORIGIN;
        const parsedBaseUrl = new URL(baseUrl, window.location.href);
        this.targetOrigin = parsedBaseUrl.origin;
        this.embedUrlBase = parsedBaseUrl.origin;
        this.baseWidth = Number(options.baseWidth) > 0 ? Number(options.baseWidth) : 640;
        this.baseHeight = Number(options.baseHeight) > 0 ? Number(options.baseHeight) : 480;
        this.defaultBoilerplate = options.boilerplate !== false;
        this.scale = 1;

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'gh-embed-wrapper';
        this.wrapper.style.position = 'relative';
        this.wrapper.style.display = 'block';
        this.wrapper.style.overflow = 'hidden';
        this.wrapper.style.background = '#000';

        this.iframe = document.createElement('iframe');
        let url = this.embedUrlBase + '/embed';
        const params = new URLSearchParams();
        if (options.theme) params.append('theme', options.theme);
        if (params.toString()) url += '?' + params.toString();

        this.iframe.src = url;
        this.iframe.width = String(this.baseWidth);
        this.iframe.height = String(this.baseHeight);
        this.iframe.style.border = '0';
        this.iframe.style.display = 'block';
        this.iframe.style.background = '#000';
        this.iframe.style.width = `${this.baseWidth}px`;
        this.iframe.style.height = `${this.baseHeight}px`;
        this.iframe.style.transformOrigin = 'top left';
        this.wrapper.appendChild(this.iframe);
        this.container.appendChild(this.wrapper);

        this.setScale(options.scale || 1);

        // Queue snippets until embed.html signals ready
        this.isReady = false;
        this.pendingRun = null;
        this._onMessage = (e) => {
            if (
                e.source === this.iframe.contentWindow &&
                e.origin === this.targetOrigin &&
                e.data &&
                e.data.type === 'EMBED_READY'
            ) {
                this.isReady = true;
                if (this.pendingRun) {
                    this._send(this.pendingRun.code, this.pendingRun.boilerplate, this.pendingRun.focus);
                    this.pendingRun = null;
                }
            }
        };
        window.addEventListener('message', this._onMessage);
    }

    runSnippet(code, options = {}) {
        let boilerplate = this.defaultBoilerplate;
        let focus = false;
        if (typeof options === 'boolean') {
            boilerplate = options;
        } else if (options && typeof options === 'object' && Object.prototype.hasOwnProperty.call(options, 'boilerplate')) {
            boilerplate = options.boilerplate !== false;
            if (Object.prototype.hasOwnProperty.call(options, 'focus')) {
                focus = options.focus === true;
            }
        }

        if (!this.isReady) {
            this.pendingRun = { code, boilerplate, focus };
        } else {
            this._send(code, boilerplate, focus);
        }
    }

    runProgram(fullCode, options = {}) {
        const focus = options && typeof options === 'object' && options.focus === true;
        this.runSnippet(fullCode, { boilerplate: false, focus: focus });
    }

    _send(code, boilerplate, focus = false) {
        this.iframe.contentWindow.postMessage({
            type: 'RUN_SNIPPET',
            snippet: code,
            boilerplate: boilerplate,
            focus: Boolean(focus)
        }, this.targetOrigin);
    }

    setScale(scale) {
        const s = Number.parseFloat(scale);
        const normalizedScale = Number.isFinite(s) && s > 0 ? s : 1;
        this.scale = normalizedScale;

        this.wrapper.style.width = `${Math.round(this.baseWidth * normalizedScale)}px`;
        this.wrapper.style.height = `${Math.round(this.baseHeight * normalizedScale)}px`;
        this.iframe.style.transform = `scale(${normalizedScale})`;
    }

    setSize(width, height) {
        const nextWidth = Number(width);
        const nextHeight = Number(height);
        if (!Number.isFinite(nextWidth) || nextWidth <= 0 || !Number.isFinite(nextHeight) || nextHeight <= 0) {
            return;
        }

        this.baseWidth = Math.round(nextWidth);
        this.baseHeight = Math.round(nextHeight);
        this.iframe.width = String(this.baseWidth);
        this.iframe.height = String(this.baseHeight);
        this.iframe.style.width = `${this.baseWidth}px`;
        this.iframe.style.height = `${this.baseHeight}px`;
        this.setScale(this.scale);
    }

    destroy() {
        window.removeEventListener('message', this._onMessage);
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
    }
}

window.GraphicsHEmbed = GraphicsHEmbed;
