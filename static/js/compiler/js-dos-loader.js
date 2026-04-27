const JSDOS_RUNTIME_SRC = '/compiler-assets/libs/js-dos.js';

function ensureRuntimeScript() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return Promise.reject(new Error('JS-DOS loader requires a browser environment.'));
    }

    if (typeof window.Dos === 'function') {
        return Promise.resolve(window.Dos);
    }

    if (window.__graphicsCompilerJSDosPromise) {
        return window.__graphicsCompilerJSDosPromise;
    }

    window.__graphicsCompilerJSDosPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-graphics-compiler-jsdos="true"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Dos), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${JSDOS_RUNTIME_SRC}`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = JSDOS_RUNTIME_SRC;
        script.async = true;
        script.dataset.graphicsCompilerJsdos = 'true';
        script.onload = () => {
            if (typeof window.Dos !== 'function') {
                reject(new Error('JS-DOS runtime loaded without exposing Dos.'));
                return;
            }
            resolve(window.Dos);
        };
        script.onerror = () => reject(new Error(`Failed to load ${JSDOS_RUNTIME_SRC}`));
        document.head.appendChild(script);
    }).catch((error) => {
        window.__graphicsCompilerJSDosPromise = null;
        throw error;
    });

    return window.__graphicsCompilerJSDosPromise;
}

const Dos = await ensureRuntimeScript();

export { Dos, ensureRuntimeScript as ensureJSDosRuntime };
export default Dos;
