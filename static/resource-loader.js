/**
 * Resource Loader Module
 * Handles loading resources from manifest.json with online/offline support and fallback URLs
 * 
 * Usage:
 *   await ResourceLoader.init();
 *   const url = await ResourceLoader.getResourceUrl('libs', 'jsdos');
 *   await ResourceLoader.loadScript('libs', 'ace');
 */

const ResourceLoader = (function () {
    let manifest = null;
    let isOnline = navigator.onLine;
    let manifestLoaded = false;
    const urlHealthCache = new Map();

    // Configuration
    const CONFIG = {
        MANIFEST_PATH: '/static/manifest.json',
        FALLBACK_TIMEOUT: 5000, // 5 seconds timeout for fetching
        REQUEST_TIMEOUT: 3000,  // 3 seconds for individual URL checks
        URL_CHECK_TTL: 5 * 60 * 1000, // 5 minutes
    };

    // Logger utility
    const Logger = {
        prefix: '[ResourceLoader]',
        info(msg) { console.log(`${this.prefix} ${msg}`); },
        success(msg) { console.log(`${this.prefix} ✓ ${msg}`); },
        error(msg, err) { console.error(`${this.prefix} ✗ ${msg}`, err || ''); },
        warn(msg) { console.warn(`${this.prefix} ⚠ ${msg}`); }
    };

    // Update online status
    window.addEventListener('online', () => {
        isOnline = true;
        Logger.info('Network status: Online');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        Logger.info('Network status: Offline');
    });

    /**
     * Initialize the resource loader by loading the manifest
     */
    async function init() {
        if (manifestLoaded && manifest) {
            return manifest;
        }

        try {
            const response = await fetch(CONFIG.MANIFEST_PATH, { cache: 'default' });
            if (!response.ok) {
                throw new Error(`Failed to load manifest: ${response.status}`);
            }
            manifest = await response.json();
            manifestLoaded = true;
            Logger.success('Manifest loaded successfully');
            return manifest;
        } catch (error) {
            Logger.error('Failed to load manifest', error);
            // Return empty manifest structure to prevent errors
            manifest = { libs: {}, assets: {}, demos: {}, videos: {}, fonts: {} };
            return manifest;
        }
    }

    /**
     * Get the manifest (loads if not already loaded)
     */
    async function getManifest() {
        if (!manifest) {
            await init();
        }
        return manifest;
    }

    /**
     * Check if a URL is accessible
     */
    async function checkUrl(url, timeout = CONFIG.REQUEST_TIMEOUT) {
        if (url.startsWith('/')) return true;
        const now = Date.now();
        const cached = urlHealthCache.get(url);
        if (cached && (now - cached.ts) < CONFIG.URL_CHECK_TTL) {
            return cached.ok;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                cache: 'default',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const ok = response.ok;
            urlHealthCache.set(url, { ok, ts: now });
            return ok;
        } catch (e) {
            urlHealthCache.set(url, { ok: false, ts: now });
            return false;
        }
    }

    /**
     * Get a resource configuration from manifest
     */
    async function getResource(category, resourceId) {
        const m = await getManifest();
        if (!m[category] || !m[category][resourceId]) {
            Logger.warn(`Resource not found: ${category}/${resourceId}`);
            return null;
        }
        return m[category][resourceId];
    }

    /**
     * Get the best available URL for a resource (with fallback support)
     * 
     * @param {string} category - The resource category (libs, assets, demos, videos)
     * @param {string} resourceId - The resource identifier
     * @param {boolean} forceLocal - Force using local path
     * @returns {Promise<string|null>} - The URL to use, or null if not found
     */
    async function getResourceUrl(category, resourceId, forceLocal = false) {
        const resource = await getResource(category, resourceId);
        if (!resource) return null;

        // If offline or forced local, use local path immediately
        if (!isOnline || forceLocal) {
            if (resource.localPath) {
                Logger.info(`Using local path for ${resourceId}: ${resource.localPath}`);
                return resource.localPath;
            }
            // Check for apiPath (videos)
            if (resource.apiPath) {
                Logger.info(`Using API path for ${resourceId}: ${resource.apiPath}`);
                return resource.apiPath;
            }
            Logger.warn(`No local path available for ${resourceId}`);
            return null;
        }

        // Try online URLs with fallback
        const urls = resource.urls || [];
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const isAccessible = await checkUrl(url);
            if (isAccessible) {
                if (i > 0) {
                    Logger.info(`Using fallback URL #${i + 1} for ${resourceId}`);
                }
                return url;
            }
            Logger.warn(`URL failed for ${resourceId}: ${url}`);
        }

        // All URLs failed, try local path
        if (resource.localPath) {
            Logger.info(`All URLs failed, using local path for ${resourceId}`);
            return resource.localPath;
        }

        // Check for apiPath (videos)
        if (resource.apiPath) {
            Logger.info(`All URLs failed, using API path for ${resourceId}`);
            return resource.apiPath;
        }

        Logger.error(`No available source for ${resourceId}`);
        return null;
    }

    /**
     * Get all URLs for a resource (for manual fallback handling)
     */
    async function getAllUrls(category, resourceId) {
        const resource = await getResource(category, resourceId);
        if (!resource) return { urls: [], localPath: null };

        return {
            urls: resource.urls || [],
            localPath: resource.localPath || null,
            apiPath: resource.apiPath || null
        };
    }

    /**
     * Fetch a resource with automatic fallback
     */
    async function fetchResource(category, resourceId, options = {}) {
        const resource = await getResource(category, resourceId);
        if (!resource) {
            throw new Error(`Resource not found: ${category}/${resourceId}`);
        }

        const urls = [...(resource.urls || [])];

        // Add local path as final fallback
        if (resource.localPath) {
            urls.push(resource.localPath);
        }
        if (resource.apiPath) {
            urls.push(resource.apiPath);
        }

        // If offline, try local first
        if (!isOnline && resource.localPath) {
            urls.unshift(resource.localPath);
        }

        let lastError = null;
        for (const url of urls) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.FALLBACK_TIMEOUT);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    Logger.success(`Fetched ${resourceId} from ${url}`);
                    return response;
                }

                lastError = new Error(`HTTP ${response.status}`);
            } catch (error) {
                lastError = error;
                Logger.warn(`Failed to fetch ${resourceId} from ${url}`);
            }
        }

        throw lastError || new Error(`All sources failed for ${resourceId}`);
    }

    /**
     * Load a script with fallback support
     * When offline: tries local path only
     * When online: tries online URLs first, then local path as fallback
     */
    async function loadScript(category, resourceId, timeout = CONFIG.FALLBACK_TIMEOUT) {
        const resource = await getResource(category, resourceId);
        if (!resource) {
            throw new Error(`Script resource not found: ${category}/${resourceId}`);
        }

        let urlsToTry = [];

        // Build the list of URLs to try based on online status
        if (!isOnline) {
            // Offline: only try local path
            if (resource.localPath) {
                urlsToTry.push(resource.localPath);
            }
        } else {
            // Online: try online URLs first, then local as fallback
            urlsToTry = [...(resource.urls || [])];
            if (resource.localPath) {
                urlsToTry.push(resource.localPath);
            }
        }

        if (urlsToTry.length === 0) {
            throw new Error(`No sources available for ${resourceId}`);
        }

        const tryLoadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;

                const timer = setTimeout(() => {
                    script.onerror = null;
                    script.onload = null;
                    reject(new Error(`Timeout loading script: ${src}`));
                }, timeout);

                script.onload = () => {
                    clearTimeout(timer);
                    resolve(src);
                };

                script.onerror = () => {
                    clearTimeout(timer);
                    reject(new Error(`Failed to load script: ${src}`));
                };

                document.head.appendChild(script);
            });
        };

        let lastError = null;
        for (let i = 0; i < urlsToTry.length; i++) {
            const url = urlsToTry[i];
            try {
                const loadedUrl = await tryLoadScript(url);
                const isLocalPath = url.startsWith('/');
                if (i > 0 || isLocalPath) {
                    Logger.info(`Loaded ${resource.name || resourceId} from ${isLocalPath ? 'local' : 'fallback'}: ${loadedUrl}`);
                } else {
                    Logger.success(`Loaded ${resource.name || resourceId}`);
                }
                return loadedUrl;
            } catch (error) {
                lastError = error;
                Logger.warn(`Failed to load ${resource.name || resourceId} from ${url}`);
            }
        }

        throw lastError || new Error(`All sources failed for ${resourceId}`);
    }


    /**
     * Get demo files configuration
     */
    async function getDemoFiles() {
        const m = await getManifest();
        const demos = m.demos || {};
        const result = {};

        for (const [id, demo] of Object.entries(demos)) {
            // Return the first URL or local path
            if (!isOnline && demo.localPath) {
                result[id] = demo.localPath;
            } else if (demo.urls && demo.urls.length > 0) {
                result[id] = demo.urls[0];
            } else if (demo.localPath) {
                result[id] = demo.localPath;
            }
        }

        return result;
    }

    /**
     * Get video source with fallback
     */
    async function getVideoSource(videoId) {
        const resource = await getResource('videos', videoId);
        if (!resource) return null;

        // Try online URLs first (R2 service as primary)
        if (resource.urls && resource.urls.length > 0) {
            return resource.urls[0];
        }

        // Fall back to API path (Flask)
        if (resource.apiPath) {
            return resource.apiPath;
        }

        // Fall back to local path
        if (resource.localPath) {
            return resource.localPath;
        }

        return null;
    }

    /**
     * Check if running offline
     */
    function isOffline() {
        return !isOnline;
    }

    /**
     * Force refresh online status
     */
    function refreshOnlineStatus() {
        isOnline = navigator.onLine;
        return isOnline;
    }

    // Public API
    return {
        init,
        getManifest,
        getResource,
        getResourceUrl,
        getAllUrls,
        fetchResource,
        loadScript,
        getDemoFiles,
        getVideoSource,
        isOffline,
        refreshOnlineStatus,
        CONFIG
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResourceLoader;
}
