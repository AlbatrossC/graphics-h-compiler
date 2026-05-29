// ==================== APP SETTINGS ====================

const SETTINGS_STORAGE_KEY = 'editor_settings';
const LEGACY_FONT_STORAGE_KEY = 'editor_font_size';

const APP_SETTINGS_DEFAULTS = Object.freeze({
    editor: {
        fontSize: 16,
        wordWrap: true,
        lineNumbers: true,
        bracketMatching: true,
        activeLine: true,
        autocomplete: true,
        hoverTooltips: true
    }
});

function cloneDefaultSettings() {
    return {
        editor: { ...APP_SETTINGS_DEFAULTS.editor }
    };
}

function clampFontSize(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return APP_SETTINGS_DEFAULTS.editor.fontSize;
    return Math.max(10, Math.min(32, parsed));
}

function normalizeAppSettings(rawSettings) {
    const base = cloneDefaultSettings();
    const raw = (rawSettings && typeof rawSettings === 'object') ? rawSettings : {};
    const legacyFontSize = localStorage.getItem(LEGACY_FONT_STORAGE_KEY);

    const rawEditor = raw.editor && typeof raw.editor === 'object' ? raw.editor : {};

    return {
        editor: {
            fontSize: clampFontSize(rawEditor.fontSize ?? raw.fontSize ?? legacyFontSize),
            wordWrap: rawEditor.wordWrap ?? raw.wordWrap ?? base.editor.wordWrap,
            lineNumbers: rawEditor.lineNumbers ?? raw.lineNumbers ?? base.editor.lineNumbers,
            bracketMatching: rawEditor.bracketMatching ?? raw.bracketMatching ?? base.editor.bracketMatching,
            activeLine: rawEditor.activeLine ?? raw.activeLine ?? base.editor.activeLine,
            autocomplete: rawEditor.autocomplete ?? raw.autocomplete ?? base.editor.autocomplete,
            hoverTooltips: rawEditor.hoverTooltips ?? raw.hoverTooltips ?? base.editor.hoverTooltips
        }
    };
}

function loadAppSettings() {
    try {
        const serialized = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!serialized) {
            return normalizeAppSettings({});
        }
        return normalizeAppSettings(JSON.parse(serialized));
    } catch (error) {
        return normalizeAppSettings({});
    }
}

function saveAppSettings(settings) {
    const normalized = normalizeAppSettings(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    localStorage.removeItem(LEGACY_FONT_STORAGE_KEY);
    return normalized;
}

// ==================== LOGGER ====================
const Logger = {
    prefix: '[Graphics.h Compiler]',

    // Color codes for console output (using console.log %c formatting)
    colors: {
        info: '#7c8df0',      // Blue
        success: '#6ac47b',   // Green
        error: '#cc4444',     // Red
        warn: '#ffb454',      // Orange
        debug: '#888888'      // Gray
    },

    timestamp() {
        return new Date().toISOString();
    },

    format(level, msg) {
        return `${this.prefix} ${this.timestamp()} [${level}] ${msg}`;
    },

    info(msg) {
        const formatted = this.format('INFO', msg);
        console.log(`%c${formatted}`, `color: ${this.colors.info}; font-weight: bold;`);
    },

    success(msg) {
        const formatted = this.format('OK', msg);
        console.log(`%c${formatted}`, `color: ${this.colors.success}; font-weight: bold;`);
    },

    error(msg, err) {
        const formatted = this.format('ERROR', msg);
        console.error(`%c${formatted}`, `color: ${this.colors.error}; font-weight: bold;`, err || '');
    },

    warn(msg) {
        const formatted = this.format('WARN', msg);
        console.warn(`%c${formatted}`, `color: ${this.colors.warn}; font-weight: bold;`);
    },

    debug(msg) {
        const formatted = this.format('DEBUG', msg);
        console.log(`%c${formatted}`, `color: ${this.colors.debug};`);
    }
};

// ==================== METRICS ====================
const metrics = {
    editor: {
        changeCount: 0,
        lastChangeAt: null
    },
    runtime: {
        runCount: 0,
        zipExtractionStarted: 0,
        zipExtractionCompleted: 0
    }
};

// ==================== GLOBAL STATE ====================
let dosInstance = null;
let terminalFocused = false;
let editor = null;
let lastLoadedDemo = ''; // Track last loaded demo
let scriptsLoaded = {
    codemirror: false
};

// ==================== CLOUD STORAGE STATE ====================
const CLOUD_STATE = {
    files: new Map(),
    folders: new Set(['root']),
    folderNameToId: new Map(),
    hashToFileKey: new Map(), // content_hash → fileKey — pre-built for O(1) duplicate detection on sign-in
    openTabs: [],
    activeFileKey: 'root/main.cpp',
    autosaveTimer: null,
    isSaving: false,
    lastSavedHash: null,
    lastSavedAt: null
};

// ==================== AUTOSAVE CONFIG ====================
// Global mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

const AUTOSAVE_DELAY_MS = 20000;  // 20-second idle autosave (spec: save after 20s of no edits)
const TYPING_DEBOUNCE_MS = 0;     // Timer resets immediately on every keystroke

// Demo files configuration
let DEMO_FILES = {};
let DEMO_FILE_CONTENTS = {};
let demoBundlePromise = null;
let compilerAssetsInitPromise = null;

const LOCAL_COMPILER_ASSETS = Object.freeze({
    assets: Object.freeze({
        'tc-zip': '/compiler-assets/zip-files/tc-v1.zip',
        'demo-files-v1': '/static/assets/demo-files-v1.json'
    }),
    demos: Object.freeze({
        'graphics-demo': '/compiler-assets/Demo_files/graphics_demo.cpp',
        'circle-pattern': '/compiler-assets/Demo_files/circle_pattern.cpp',
        'bouncing-ball': '/compiler-assets/Demo_files/bouncing_ball.cpp',
        'shooter-game': '/compiler-assets/Demo_files/shooter_game.cpp'
    })
});

function getCompilerAssetCandidateUrls(category, resourceId) {
    const url = LOCAL_COMPILER_ASSETS?.[category]?.[resourceId];
    return url ? [url] : [];
}

async function fetchCompilerAsset(category, resourceId, options = {}) {
    const urls = getCompilerAssetCandidateUrls(category, resourceId);
    if (!urls.length) {
        throw new Error(`Unknown compiler asset: ${category}/${resourceId}`);
    }

    return fetch(urls[0], options.fetchOptions || {});
}

// Initialize local compiler asset sources
async function initializeResourcesFromManifest() {
    if (compilerAssetsInitPromise) {
        return compilerAssetsInitPromise;
    }

    compilerAssetsInitPromise = (async () => {
        try {
            DEMO_FILES = { ...LOCAL_COMPILER_ASSETS.demos };
            Logger.success('Compiler asset sources initialized');
        } catch (error) {
            Logger.error('Failed to initialize compiler assets', error);
            DEMO_FILES = { ...LOCAL_COMPILER_ASSETS.demos };
        }
    })();

    return compilerAssetsInitPromise;
}

async function loadDemoBundle() {
    if (demoBundlePromise) return demoBundlePromise;

    demoBundlePromise = (async () => {
        const response = await fetchCompilerAsset('assets', 'demo-files-v1', {
            fetchOptions: { cache: 'default' }
        });
        if (!response.ok) {
            throw new Error(`Failed to load demo bundle (HTTP ${response.status})`);
        }

        const payload = await response.json();
        const files = Array.isArray(payload?.files) ? payload.files : [];
        DEMO_FILE_CONTENTS = {};

        for (const file of files) {
            if (!file?.demo_key || typeof file.code_content !== 'string') continue;
            DEMO_FILE_CONTENTS[file.demo_key] = file.code_content;
            if (file.file_name) {
                DEMO_FILES[file.demo_key] = file.file_name;
            }
        }

        Logger.success(`Demo bundle loaded (${files.length} demos)`);
        return DEMO_FILE_CONTENTS;
    })();

    return demoBundlePromise;
}

// ==================== CACHING SYSTEM ====================
const CACHE_CONFIG = {
    DEMO_CACHE_PREFIX: 'demo_cache_',
    CACHE_TTL: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    COMPILER_CACHE_NAME: 'graphics-h-compiler-runtime-v1',
    JSDOS_RUNTIME_URL: '/libs/js-dos.js',
    WDOSBOX_SCRIPT_URL: '/libs/wdosbox.js',
    PRELOAD_WASM_URL: '/libs/wdosbox.wasm',
    DOS_RUNNER_URL: '/static/html/dos-runner.html'
};

const compilerFetchPromises = new Map();
let preloadStarted = false;
let preloadPromise = null;
let dosRunnerFramePromise = null;

async function openCompilerCache() {
    if (typeof caches === 'undefined') {
        return null;
    }

    try {
        return await caches.open(CACHE_CONFIG.COMPILER_CACHE_NAME);
    } catch (error) {
        Logger.warn(`Cache API unavailable: ${error.message}`);
        return null;
    }
}

function normalizeCacheUrl(url) {
    return new URL(url, window.location.origin).toString();
}

async function getCachedResponse(url) {
    const cache = await openCompilerCache();
    if (!cache) return null;

    return cache.match(normalizeCacheUrl(url));
}

async function hasCachedCompilerAsset(category, resourceId) {
    const candidateUrls = getCompilerAssetCandidateUrls(category, resourceId, { preferLocal: !navigator.onLine });
    for (const url of candidateUrls) {
        if (await getCachedResponse(url)) {
            return true;
        }
    }
    return false;
}

async function cachedFetch(url, fetchOptions = {}) {
    const normalizedUrl = normalizeCacheUrl(url);
    const existingPromise = compilerFetchPromises.get(normalizedUrl);
    if (existingPromise) {
        return (await existingPromise).clone();
    }

    const requestPromise = (async () => {
        const cached = await getCachedResponse(normalizedUrl);
        if (cached) {
            Logger.info(`Cache hit: ${normalizedUrl}`);
            return cached;
        }

        Logger.info(`Fetching asset: ${normalizedUrl}`);
        const response = await fetch(normalizedUrl, {
            cache: 'default',
            ...fetchOptions
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch ${normalizedUrl} (HTTP ${response.status})`);
        }

        const blob = await response.blob();
        if (!blob.size) {
            throw new Error(`Refusing to cache empty response for ${normalizedUrl}`);
        }

        const cacheableResponse = new Response(blob, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

        const cache = await openCompilerCache();
        if (cache) {
            await cache.put(normalizedUrl, cacheableResponse.clone());
        }

        return cacheableResponse;
    })().finally(() => {
        compilerFetchPromises.delete(normalizedUrl);
    });

    compilerFetchPromises.set(normalizedUrl, requestPromise);
    return (await requestPromise).clone();
}

async function cachedFetchCompilerAsset(category, resourceId, options = {}) {
    const candidateUrls = getCompilerAssetCandidateUrls(category, resourceId, options);
    let lastError = null;

    for (const url of candidateUrls) {
        try {
            return await cachedFetch(url, options.fetchOptions || {});
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error(`Failed to fetch compiler asset: ${category}/${resourceId}`);
}

// Demo file cache using localStorage
const DemoCache = {
    get(demoKey) {
        try {
            const cacheKey = CACHE_CONFIG.DEMO_CACHE_PREFIX + demoKey;
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;

            const { code, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;

            if (age < CACHE_CONFIG.CACHE_TTL) {
                return code;
            }

            // Expired, remove it
            localStorage.removeItem(cacheKey);
            return null;
        } catch (e) {
            return null;
        }
    },

    set(demoKey, code) {
        try {
            const cacheKey = CACHE_CONFIG.DEMO_CACHE_PREFIX + demoKey;
            localStorage.setItem(cacheKey, JSON.stringify({
                code: code,
                timestamp: Date.now()
            }));
            return true;
        } catch (e) {
            Logger.warn('Failed to cache demo file: ' + e.message);
            return false;
        }
    }
};

// ==================== JS-DOS WARMUP SYSTEM ====================
let tcZipPromise = null; // Shared promise to prevent duplicate downloads

// Shared function to get TC ZIP - prevents race condition between warmup and run
async function getTCZip() {
    await initializeResourcesFromManifest();

    if (tcZipPromise) return tcZipPromise;

    tcZipPromise = (async () => {
        try {
            const response = await cachedFetchCompilerAsset('assets', 'tc-zip');
            const blob = await response.blob();
            Logger.success('TC ZIP ready');
            return blob;
        } catch (error) {
            tcZipPromise = null; // Clear rejected promise
            throw error;
        }
    })();

    return tcZipPromise;
}

async function startPreload() {
    if (preloadStarted && preloadPromise) {
        return preloadPromise;
    }

    preloadStarted = true;
    preloadPromise = (async () => {
        await initializeResourcesFromManifest();

        Logger.info('Starting compiler preload sequence...');
        await cachedFetch(CACHE_CONFIG.JSDOS_RUNTIME_URL);
        await cachedFetch(CACHE_CONFIG.WDOSBOX_SCRIPT_URL);
        await cachedFetch(CACHE_CONFIG.PRELOAD_WASM_URL);
        await cachedFetchCompilerAsset('assets', 'tc-zip');
        Logger.success('Compiler preload finished');
    })().catch((error) => {
        preloadStarted = false;
        preloadPromise = null;
        throw error;
    });

    return preloadPromise;
}

// Update cache status indicator on Run button
async function updateCacheStatus() {
    try {
        const cached = await hasCachedCompilerAsset('assets', 'tc-zip');
        if (cached && runBtn) {
            runBtn.title = 'Run this program [Ctrl+Enter]';
            Logger.info('Cache status: TC ZIP is cached');
        } else if (runBtn) {
            runBtn.title = 'Run this program [Ctrl+Enter]';
        }
    } catch (e) {
        // Silently ignore
    }
}


const loading = document.getElementById("loading");
const loadingText = document.getElementById("loading-text");
const loadingProgressBar = document.getElementById("loading-progress-bar");
const editorLoadingText = document.getElementById("editor-loading-text");
const editorLoadingSubtext = document.getElementById("editor-loading-subtext");
const runBtn = document.getElementById("run-btn");
const terminalWrapper = document.getElementById("terminal-wrapper");
const keyboardBlocker = document.getElementById("keyboard-blocker");
const editorWrapper = document.getElementById("editor-wrapper");
const demoSelect = document.getElementById("demo-select");
const clearBtn = document.getElementById("clear-btn");
const editorInfo = document.getElementById("editor-info");
const saveIndicator = document.getElementById("save-indicator");
const saveText = document.getElementById("save-text");
const terminalIdleState = document.getElementById("terminal-idle-state");

function updateEditorLoadingState(title, detail) {
    if (editorLoadingText && title) {
        editorLoadingText.textContent = title;
    }
    if (editorLoadingSubtext && detail) {
        editorLoadingSubtext.textContent = detail;
    }
}

function ensureDosRunnerFrame() {
    if (dosRunnerFramePromise) {
        return dosRunnerFramePromise;
    }

    const iframe = document.getElementById('dos-iframe');
    if (!iframe) {
        return Promise.reject(new Error('DOS terminal iframe is missing.'));
    }

    if (iframe.dataset.loaded === 'true' && iframe.src) {
        dosRunnerFramePromise = Promise.resolve(iframe);
        return dosRunnerFramePromise;
    }

    dosRunnerFramePromise = new Promise((resolve, reject) => {
        const handleLoad = () => {
            iframe.dataset.loaded = 'true';
            if (terminalIdleState) {
                terminalIdleState.classList.add('hidden');
            }
            resolve(iframe);
        };

        const handleError = () => {
            dosRunnerFramePromise = null;
            reject(new Error('Failed to load DOS runner frame.'));
        };

        iframe.addEventListener('load', handleLoad, { once: true });
        iframe.addEventListener('error', handleError, { once: true });

        if (!iframe.src) {
            iframe.src = iframe.dataset.src || CACHE_CONFIG.DOS_RUNNER_URL;
        } else if (iframe.dataset.loaded === 'true') {
            handleLoad();
        }
    });

    return dosRunnerFramePromise;
}

// ==================== OUTPUT PANEL HANDLERS ====================

// Output Panel Elements
const outputPanel = document.getElementById("output-panel");
const outputContent = document.getElementById("output-content");
const closeOutputBtn = document.getElementById("close-output-btn");
let lastErrorContent = '';

closeOutputBtn.addEventListener('click', () => {
    outputPanel.classList.remove('visible');
    terminalWrapper.classList.remove('has-panel');
    // Trigger resize to fix canvas layout
    window.dispatchEvent(new Event('resize'));
});

// Copy Error Button Functionality
const copyErrorBtn = document.getElementById("copy-error-btn");
const copyBtnText = document.getElementById("copy-btn-text");

copyErrorBtn.addEventListener('click', async () => {
    const errorText = outputContent.textContent;

    if (!errorText || errorText.trim() === '') {
        return;
    }

    try {
        await navigator.clipboard.writeText(errorText);

        // Visual feedback
        copyErrorBtn.classList.add('copied');
        copyBtnText.textContent = 'Copied';

        Logger.success('Errors copied to clipboard');

        // Reset after 2 seconds
        setTimeout(() => {
            copyErrorBtn.classList.remove('copied');
            copyBtnText.textContent = 'Copy Errors';
        }, 2000);
    } catch (err) {
        Logger.error('Failed to copy errors', err);

        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = errorText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();

        try {
            document.execCommand('copy');
            copyErrorBtn.classList.add('copied');
            copyBtnText.textContent = 'Copied';

            setTimeout(() => {
                copyErrorBtn.classList.remove('copied');
                copyBtnText.textContent = 'Copy Errors';
            }, 2000);
        } catch (fallbackErr) {
            Logger.error('Fallback copy failed', fallbackErr);
        }

        document.body.removeChild(textArea);
    }
});

// Expand Button Functionality
const expandOutputBtn = document.getElementById("expand-output-btn");
let isOutputExpanded = false;

expandOutputBtn.addEventListener('click', () => {
    isOutputExpanded = !isOutputExpanded;

    if (isOutputExpanded) {
        outputPanel.classList.add('expanded');
        expandOutputBtn.classList.add('expanded');
        expandOutputBtn.title = 'Collapse panel';
    } else {
        outputPanel.classList.remove('expanded');
        expandOutputBtn.classList.remove('expanded');
        expandOutputBtn.title = 'Expand panel';
    }

    // Trigger resize to fix canvas layout
    setTimeout(() => window.dispatchEvent(new Event('resize')), 310);

    Logger.info(`Output panel ${isOutputExpanded ? 'expanded' : 'collapsed'}`);
});

// ==================== PANEL SPLITTERS ====================
(function initSplitters() {
    const sidebar = document.getElementById('sidebar');
    const editorWrapper = document.getElementById('editor-wrapper');
    const terminalWrapper = document.getElementById('terminal-wrapper');
    const splitterSidebar = document.getElementById('splitter-sidebar');
    const splitterTerminal = document.getElementById('splitter-terminal');

    let isDragging = false;
    let currentSplitter = null;
    let startX = 0;
    let startWidthSidebar = 0;
    let startEditorFlex = 0;
    let startTerminalFlex = 0;

    // Hide/show the sidebar splitter based on sidebar collapsed state
    function updateSidebarSplitterVisibility() {
        if (!splitterSidebar || !sidebar) return;
        const isCollapsed = sidebar.classList.contains('collapsed');
        splitterSidebar.style.display = isCollapsed ? 'none' : '';
    }

    if (sidebar) {
        const observer = new MutationObserver(updateSidebarSplitterVisibility);
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        updateSidebarSplitterVisibility();
    }

    // Hide splitters when a panel goes fullscreen
    function updateSplittersForFullscreen() {
        const anyFullscreen = document.querySelector('#editor-wrapper.fullscreen, #terminal-wrapper.fullscreen');
        const hide = Boolean(anyFullscreen);
        if (splitterSidebar) splitterSidebar.style.visibility = hide ? 'hidden' : '';
        if (splitterTerminal) splitterTerminal.style.visibility = hide ? 'hidden' : '';
    }

    [editorWrapper, terminalWrapper].forEach(panel => {
        if (!panel) return;
        const obs = new MutationObserver(updateSplittersForFullscreen);
        obs.observe(panel, { attributes: true, attributeFilter: ['class'] });
    });

    // -- Shared drag helpers --
    function startDrag(clientX, splitterType) {
        isDragging = true;
        currentSplitter = splitterType;
        startX = clientX;

        if (splitterType === 'sidebar') {
            startWidthSidebar = sidebar ? sidebar.offsetWidth : 0;
            if (splitterSidebar) splitterSidebar.classList.add('dragging');
        } else if (splitterType === 'terminal') {
            startEditorFlex = editorWrapper ? editorWrapper.getBoundingClientRect().width : 1;
            startTerminalFlex = terminalWrapper ? terminalWrapper.getBoundingClientRect().width : 1;
            if (splitterTerminal) splitterTerminal.classList.add('dragging');
        }

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const iframe = document.getElementById('dos-iframe');
        if (iframe) iframe.style.pointerEvents = 'none';
    }

    function moveDrag(clientX) {
        if (!isDragging) return;
        const dx = clientX - startX;

        if (currentSplitter === 'sidebar') {
            const newWidth = startWidthSidebar + dx;
            if (newWidth < 80) {
                if (sidebar && !sidebar.classList.contains('collapsed')) {
                    sidebar.classList.add('collapsed');
                    sidebar.style.width = '';
                    sidebar.style.minWidth = '';
                    endDrag();
                }
                return;
            }
            const boundedWidth = Math.max(120, Math.min(600, newWidth));
            if (sidebar) {
                sidebar.style.width = boundedWidth + 'px';
                sidebar.style.minWidth = boundedWidth + 'px';
            }
        } else if (currentSplitter === 'terminal') {
            const newEditorW = startEditorFlex + dx;
            const newTerminalW = startTerminalFlex - dx;
            if (newEditorW < 80 || newTerminalW < 80) return;
            const total = newEditorW + newTerminalW;
            if (editorWrapper) editorWrapper.style.flex = (newEditorW / total * 4).toFixed(3) + ' 1 0';
            if (terminalWrapper) terminalWrapper.style.flex = (newTerminalW / total * 4).toFixed(3) + ' 1 0';
        }
    }

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        currentSplitter = null;

        if (splitterSidebar) splitterSidebar.classList.remove('dragging');
        if (splitterTerminal) splitterTerminal.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);

        const iframe = document.getElementById('dos-iframe');
        if (iframe) iframe.style.pointerEvents = '';

        window.dispatchEvent(new Event('resize'));
        if (typeof editor !== 'undefined' && editor && editor.requestMeasure) {
            setTimeout(() => editor.requestMeasure(), 50);
        }
    }

    // -- Mouse handlers --
    function onMouseDown(e, splitterType) {
        if (e.button !== 0) return;
        startDrag(e.clientX, splitterType);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    }

    function onMouseMove(e) { moveDrag(e.clientX); }
    function onMouseUp() { endDrag(); }

    // -- Touch handlers --
    function onTouchStart(e, splitterType) {
        if (e.touches.length !== 1) return;
        startDrag(e.touches[0].clientX, splitterType);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        e.preventDefault();
    }

    function onTouchMove(e) {
        if (e.touches.length !== 1) return;
        moveDrag(e.touches[0].clientX);
        e.preventDefault();
    }

    function onTouchEnd() { endDrag(); }

    // -- Double-click to reset to default ratio --
    function resetSidebarWidth() {
        if (!sidebar) return;
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
        }
        window.dispatchEvent(new Event('resize'));
        if (typeof editor !== 'undefined' && editor && editor.requestMeasure) {
            setTimeout(() => editor.requestMeasure(), 50);
        }
    }

    function resetPanelRatio() {
        if (editorWrapper) editorWrapper.style.flex = '';
        if (terminalWrapper) terminalWrapper.style.flex = '';
        window.dispatchEvent(new Event('resize'));
        if (typeof editor !== 'undefined' && editor && editor.requestMeasure) {
            setTimeout(() => editor.requestMeasure(), 50);
        }
    }

    // -- Bind events --
    if (splitterSidebar) {
        splitterSidebar.addEventListener('mousedown', (e) => onMouseDown(e, 'sidebar'));
        splitterSidebar.addEventListener('touchstart', (e) => onTouchStart(e, 'sidebar'), { passive: false });
        splitterSidebar.addEventListener('dblclick', resetSidebarWidth);
    }
    if (splitterTerminal) {
        splitterTerminal.addEventListener('mousedown', (e) => onMouseDown(e, 'terminal'));
        splitterTerminal.addEventListener('touchstart', (e) => onTouchStart(e, 'terminal'), { passive: false });
        splitterTerminal.addEventListener('dblclick', resetPanelRatio);
    }
})();

