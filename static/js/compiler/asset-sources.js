const COMPILER_ASSET_SOURCES = Object.freeze({
    libs: Object.freeze({
        jsdos: Object.freeze({
            urls: ['https://js-dos.com/6.22/current/js-dos.js'],
            localPath: '/libs/js-dos.js'
        }),
        wdosbox: Object.freeze({
            urls: ['https://js-dos.com/6.22/current/wdosbox.js'],
            localPath: '/libs/wdosbox.js'
        })
    }),
    assets: Object.freeze({
        'tc-zip': Object.freeze({
            urls: [
                'https://r2-public-assets.albatrossc.workers.dev/system/tc-v1.zip',
                'https://ltjlklxc9homgiye.public.blob.vercel-storage.com/zips/tc-v1.zip'
            ],
            localPath: '/compiler-assets/zip-files/tc-v1.zip'
        }),
        'demo-files-v1': Object.freeze({
            urls: [],
            localPath: '/compiler-assets/Demo_files/demo-files-v1.json'
        })
    }),
    demos: Object.freeze({
        'graphics-demo': Object.freeze({
            urls: [
                'https://r2-public-assets.albatrossc.workers.dev/demo/graphics_demo.cpp',
                'https://ltjlklxc9homgiye.public.blob.vercel-storage.com/demo/graphics_demo.cpp'
            ],
            localPath: '/compiler-assets/Demo_files/graphics_demo.cpp'
        }),
        'circle-pattern': Object.freeze({
            urls: [
                'https://r2-public-assets.albatrossc.workers.dev/demo/circle_pattern.cpp',
                'https://ltjlklxc9homgiye.public.blob.vercel-storage.com/demo/circle-pattern.cpp'
            ],
            localPath: '/compiler-assets/Demo_files/circle_pattern.cpp'
        }),
        'bouncing-ball': Object.freeze({
            urls: [
                'https://r2-public-assets.albatrossc.workers.dev/demo/bouncing_ball.cpp',
                'https://ltjlklxc9homgiye.public.blob.vercel-storage.com/demo/bouncing-ball.cpp'
            ],
            localPath: '/compiler-assets/Demo_files/bouncing_ball.cpp'
        }),
        'shooter-game': Object.freeze({
            urls: [
                'https://r2-public-assets.albatrossc.workers.dev/demo/shooter_game.cpp',
                'https://ltjlklxc9homgiye.public.blob.vercel-storage.com/demo/shooter-game.cpp'
            ],
            localPath: '/compiler-assets/Demo_files/shooter_game.cpp'
        })
    })
});

const compilerAssetHealthCache = new Map();

function getCompilerAsset(category, resourceId) {
    return COMPILER_ASSET_SOURCES?.[category]?.[resourceId] || null;
}

function getCompilerAssetCandidateUrls(category, resourceId, options = {}) {
    const asset = getCompilerAsset(category, resourceId);
    if (!asset) return [];

    const preferLocal = options.preferLocal === true || !navigator.onLine;
    const remoteUrls = Array.isArray(asset.urls) ? asset.urls : [];
    const localUrl = asset.localPath || null;

    return preferLocal
        ? [localUrl, ...remoteUrls].filter(Boolean)
        : [...remoteUrls, localUrl].filter(Boolean);
}

async function isCompilerAssetUrlReachable(url, timeout = 3000) {
    if (!url) return false;
    if (url.startsWith('/')) return true;
    if (!navigator.onLine) return false;

    const now = Date.now();
    const cached = compilerAssetHealthCache.get(url);
    if (cached && (now - cached.timestamp) < 300000) {
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
        compilerAssetHealthCache.set(url, { ok, timestamp: now });
        return ok;
    } catch (error) {
        compilerAssetHealthCache.set(url, { ok: false, timestamp: now });
        return false;
    }
}

async function resolveCompilerAssetUrl(category, resourceId, options = {}) {
    const candidateUrls = getCompilerAssetCandidateUrls(category, resourceId, options);
    const asset = getCompilerAsset(category, resourceId);
    const localUrl = asset?.localPath || null;

    for (const url of candidateUrls) {
        if (!url) continue;
        if (url.startsWith('/')) {
            return url;
        }
        if (await isCompilerAssetUrlReachable(url, options.timeout || 3000)) {
            return url;
        }
    }

    return localUrl;
}

async function fetchCompilerAsset(category, resourceId, options = {}) {
    const asset = getCompilerAsset(category, resourceId);
    if (!asset) {
        throw new Error(`Unknown compiler asset: ${category}/${resourceId}`);
    }

    const candidateUrls = getCompilerAssetCandidateUrls(category, resourceId, options);

    let lastError = null;
    for (const url of candidateUrls) {
        if (!url) continue;
        try {
            const response = await fetch(url, options.fetchOptions || {});
            if (response.ok) {
                return response;
            }
            lastError = new Error(`Failed to fetch ${resourceId} (HTTP ${response.status})`);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error(`Failed to fetch compiler asset: ${category}/${resourceId}`);
}

async function loadCompilerScript(category, resourceId, timeout = 5000) {
    const url = await resolveCompilerAssetUrl(category, resourceId, { timeout });
    if (!url) {
        throw new Error(`Unable to resolve script: ${category}/${resourceId}`);
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => {
            script.onload = null;
            script.onerror = null;
            reject(new Error(`Timeout loading script: ${url}`));
        }, timeout);

        script.src = url;
        script.onload = () => {
            clearTimeout(timer);
            resolve(url);
        };
        script.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`Failed to load script: ${url}`));
        };
        document.head.appendChild(script);
    });
}

function getCompilerDemoFiles() {
    const demoEntries = Object.entries(COMPILER_ASSET_SOURCES.demos || {});
    const demos = {};
    for (const [key, asset] of demoEntries) {
        demos[key] = (!navigator.onLine || !asset.urls?.length)
            ? asset.localPath
            : asset.urls[0];
    }
    return demos;
}
