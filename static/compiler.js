// ==================== CONFIGURATION ====================

const CONFIG = {
    TC_ZIP_URL: '/tc-zip',
    DEMO_FILES: {
        'graphics_demo': '/compiler-assets/Demo_files/graphics_demo.cpp',
        'circle_pattern': '/compiler-assets/Demo_files/circle_pattern.cpp',
        'bouncing_ball': '/compiler-assets/Demo_files/bouncing_ball.cpp',
        'shooter_game': '/compiler-assets/Demo_files/shooter_game.cpp'
    },
    SCRIPTS: {
        'jsdos': {
            cdn: 'https://js-dos.com/6.22/current/js-dos.js',
            local: ['/compiler-assets/libs/js-dos.js', '../compiler-assets/libs/js-dos.js']
        },
        'ace': {
            cdn: 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.6/ace.min.js',
            local: ['/compiler-assets/libs/ace.js', '../compiler-assets/libs/ace.js']
        },
        'ace-mode': {
            cdn: 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.6/mode-c_cpp.min.js',
            local: ['/compiler-assets/libs/mode-c_cpp.js', '../compiler-assets/libs/mode-c_cpp.js']
        },
        'ace-theme-monokai': {
            cdn: 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.6/theme-monokai.min.js',
            local: ['/compiler-assets/libs/theme-monokai.js', '../compiler-assets/libs/theme-monokai.js']
        },
        'ace-ext-language_tools': {
            cdn: 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.6/ext-language_tools.min.js',
            local: [
                '/compiler-assets/libs/ext-language_tools.js',
                '/compiler-assets/libs/ext-language_tools.min.js',
                '/compiler-assets/libs/ext-language-tools.js',
                '../compiler-assets/libs/ext-language_tools.js'
            ]
        },
        'ace-theme-textmate': {
            cdn: 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.6/theme-textmate.min.js',
            local: ['/compiler-assets/libs/theme-textmate.js', '../compiler-assets/libs/theme-textmate.js']
        }
    },
    WDOSBOX: {
        cdn: 'https://js-dos.com/6.22/current/wdosbox.js',
        local: ['/compiler-assets/libs/wdosbox.js', '../compiler-assets/libs/wdosbox.js']
    },
    CACHE_TTL: 7 * 24 * 60 * 60 * 1000
};

const OFFLINE_MODE = location.protocol === 'file:' || navigator.onLine === false;

// ==================== LOGGER ====================

const Logger = {
    prefix: '[Graphics.h Compiler]',

    _log(type, msg, args = []) {
        const style = 'color: #3b82f6; font-weight: bold;';

        if (type === 'error') {
            console.error(`%c${this.prefix}%c ${msg}`, style, '', ...args);
        } else if (type === 'warn') {
            console.warn(`%c${this.prefix}%c ${msg}`, style, '', ...args);
        } else {
            console.log(`%c${this.prefix}%c ${msg}`, style, '', ...args);
        }
    },

    info(msg) { this._log('info', msg); },
    success(msg) { this._log('success', msg); },
    error(msg, err) { this._log('error', msg, [err || '']); },
    warn(msg) { this._log('warn', msg); }
};

// ==================== SCRIPT LOADER WITH FALLBACK ====================

function loadScript(name, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const scriptConfig = CONFIG.SCRIPTS[name] || (name === 'wdosbox' ? CONFIG.WDOSBOX : null);

        if (!scriptConfig) {
            reject(new Error(`Unknown script: ${name}`));
            return;
        }

        const tryLoad = (src, isFallback = false) => {
            return new Promise((res, rej) => {
                const script = document.createElement('script');
                script.src = src;

                const timer = setTimeout(() => {
                    script.onerror = null;
                    script.onload = null;
                    rej(new Error('Timeout'));
                }, timeout);

                script.onload = () => {
                    clearTimeout(timer);
                    if (isFallback) {
                        Logger.info(`${name}: Using local fallback`);
                    } else {
                        Logger.success(`${name}: Loaded from CDN`);
                    }
                    res(true);
                };

                script.onerror = () => {
                    clearTimeout(timer);
                    rej(new Error(`Failed to load: ${src}`));
                };

                document.head.appendChild(script);
            });
        };

        const toArray = (value) => Array.isArray(value) ? value : [value];
        const localSources = toArray(scriptConfig.local).filter(Boolean);
        const sources = OFFLINE_MODE
            ? localSources.map(src => ({ src, isFallback: true }))
            : [{ src: scriptConfig.cdn, isFallback: false }, ...localSources.map(src => ({ src, isFallback: true }))];

        let index = 0;
        const tryNext = () => {
            if (index >= sources.length) {
                reject(new Error(`Failed to load ${name} from all sources`));
                return;
            }

            const { src, isFallback } = sources[index++];

            if (isFallback) {
                Logger.warn(`${name}: Trying local source ${src}`);
            }

            tryLoad(src, isFallback)
                .then(resolve)
                .catch(() => tryNext());
        };

        tryNext();
    });
}

async function loadAllScripts() {
    try {
        Logger.info('Loading dependencies...');
        updateLoadingProgress(10);


        await loadScript('jsdos');
        updateLoadingProgress(30);


        await loadScript('ace');
        updateLoadingProgress(50);

        await waitForAce();

        // Load Language Tools if compatible with this Ace build
        try {
            const eventModule = ace && ace.require ? ace.require('ace/lib/event') : null;
            if (eventModule && typeof eventModule.preventParentScroll === 'function') {
                await loadScript('ace-ext-language_tools');
                languageToolsAvailable = true;
            } else {
                Logger.warn('Ace language tools not compatible with this Ace build; skipping autocomplete');
                languageToolsAvailable = false;
            }
        } catch (e) {
            Logger.warn('Ace language tools failed to load; autocomplete disabled');
            languageToolsAvailable = false;
        }

        // Load Ace C++ Mode
        await loadScript('ace-mode');
        updateLoadingProgress(70);


        await loadScript('ace-theme-monokai');
        await loadScript('ace-theme-textmate');

        updateLoadingProgress(100);

        Logger.success('All dependencies loaded');
        return true;
    } catch (error) {
        Logger.error('Failed to load dependencies', error);
        alert('Failed to load required libraries. Please check your connection or try offline mode.');
        return false;
    }
}

function waitForAce() {
    return new Promise((resolve) => {
        const checkAce = setInterval(() => {
            if (typeof ace !== 'undefined') {
                clearInterval(checkAce);
                resolve();
            }
        }, 50);
    });
}

// ==================== GLOBAL STATE ====================

let dosInstance = null;
let terminalFocused = false;
let editor = null;
let currentDemo = 'graphics_demo';
let lastLoadedDemo = '';
let errorUpdateInterval = null;
let lastErrorContent = '';
let isEditorFullscreen = false;
let isTerminalFullscreen = false;
let isOutputExpanded = false;
let keyboardEventBlocker = null;
let languageToolsAvailable = false;

// ==================== CACHING SYSTEM ====================

const CACHE_CONFIG = {
    TC_ZIP_CACHE_KEY: 'tc_zip_cache_legacy',
    DEMO_CACHE_PREFIX: 'demo_cache_legacy_',
    DB_NAME: 'GraphicsHCompilerCacheLegacy',
    DB_VERSION: 1,
    STORE_NAME: 'files'
};

let cacheAvailable = true;

class CacheDB {
    static db = null;

    static async open() {
        if (!cacheAvailable) return null;
        if (this.db) return this.db;

        return new Promise((resolve) => {
            const request = indexedDB.open(CACHE_CONFIG.DB_NAME, CACHE_CONFIG.DB_VERSION);

            request.onerror = () => {
                cacheAvailable = false;
                Logger.warn('IndexedDB not available, caching disabled');
                resolve(null);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(CACHE_CONFIG.STORE_NAME)) {
                    db.createObjectStore(CACHE_CONFIG.STORE_NAME, { keyPath: 'key' });
                }
            };
        });
    }

    static async get(key) {
        const db = await this.open();
        if (!db) return null;

        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readonly');
                const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => {
                    const result = request.result;
                    if (result && result.timestamp) {
                        const age = Date.now() - result.timestamp;
                        if (age < CONFIG.CACHE_TTL) {
                            resolve(result.data);
                            return;
                        }
                    }
                    resolve(null);
                };

                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    static async set(key, data) {
        const db = await this.open();
        if (!db) return false;

        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
                const request = store.put({
                    key: key,
                    data: data,
                    timestamp: Date.now()
                });

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }
}

const DemoCache = {
    get(demoKey) {
        try {
            const cacheKey = CACHE_CONFIG.DEMO_CACHE_PREFIX + demoKey;
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;

            const { code, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;

            if (age < CONFIG.CACHE_TTL) {
                return code;
            }

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

// ==================== TC ZIP MANAGEMENT ====================

let tcZipPromise = null;

async function getTCZip() {
    if (tcZipPromise) return tcZipPromise;

    tcZipPromise = (async () => {
        let blob = await CacheDB.get(CACHE_CONFIG.TC_ZIP_CACHE_KEY);
        if (blob) {
            Logger.info('TC ZIP loaded from cache');
            return blob;
        }

        Logger.info('Downloading TC ZIP...');
        const response = await fetch(CONFIG.TC_ZIP_URL);
        if (!response.ok) {
            throw new Error(`Failed to download compiler (HTTP ${response.status})`);
        }
        blob = await response.blob();

        CacheDB.set(CACHE_CONFIG.TC_ZIP_CACHE_KEY, blob)
            .then(cached => {
                if (cached) Logger.success('TC ZIP cached for future use');
            });

        return blob;
    })();

    return tcZipPromise;
}

// ==================== THEME MANAGEMENT ====================

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    if (editor) {
        const aceTheme = newTheme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/textmate';
        editor.setTheme(aceTheme);
    }

    Logger.info(`Theme switched to ${newTheme}`);
}

function updateThemeIcon(theme) {
    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');

    if (theme === 'dark') {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
    } else {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
    }
}



// Low-latency debounce function
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// ==================== EDITOR MANAGEMENT ====================

function updateEditorInfo() {
    const editorInfo = document.getElementById('editor-info');
    if (!editor || !editorInfo) return;

    const code = editor.getValue();
    const lines = code.split('\n').length;
    const chars = code.length;

    editorInfo.textContent = `Lines: ${lines} | Chars: ${chars}`;
}

let lastSavedCode = localStorage.getItem('tc_code') || '';

function updateSaveIndicator() {
    const saveIndicator = document.getElementById('save-indicator');
    const saveText = document.getElementById('save-text');
    const currentCode = editor ? editor.getValue() : '';

    if (lastSavedCode === currentCode && lastSavedCode !== '') {
        saveIndicator.classList.add('saved');
        saveText.textContent = 'Saved';
    } else {
        saveIndicator.classList.remove('saved');
        saveText.textContent = 'Not Saved';
    }
}

function saveCode() {
    if (!editor) return;

    const code = editor.getValue();
    localStorage.setItem('tc_code', code);
    lastSavedCode = code;

    const saveIndicator = document.getElementById('save-indicator');
    const saveText = document.getElementById('save-text');

    saveIndicator.classList.add('saved');
    saveText.textContent = 'Saved';

    Logger.success('Code saved to browser storage');

    setTimeout(() => {
        saveIndicator.classList.remove('saved');
        saveText.textContent = 'Not Saved';
    }, 2000);
}

async function loadDemoFile(demoKey, forceReload = false) {
    if (!editor) return;

    try {
        if (!forceReload) {
            const cachedCode = DemoCache.get(demoKey);
            if (cachedCode) {
                Logger.info(`Loading ${demoKey} demo from cache`);
                editor.setValue('', -1);
                await new Promise(resolve => setTimeout(resolve, 50));
                editor.setValue(cachedCode, -1);
                editor.clearSelection();
                editor.moveCursorTo(0, 0);

                lastLoadedDemo = demoKey;
                currentDemo = demoKey;
                currentDemo = demoKey;
                localStorage.removeItem('tc_code');
                lastSavedCode = '';

                updateEditorInfo();
                updateSaveIndicator();

                Logger.success(`Loaded ${demoKey} demo from cache`);
                return;
            }
        }

        Logger.info(`Loading ${demoKey} demo...${forceReload ? ' (force reload)' : ''}`);

        const demoUrl = CONFIG.DEMO_FILES[demoKey];
        if (!demoUrl) {
            throw new Error(`Demo file not found: ${demoKey}`);
        }

        const cacheBuster = forceReload ? `?t=${Date.now()}` : '';
        const response = await fetch(demoUrl + cacheBuster);

        if (response.ok) {
            const code = await response.text();

            DemoCache.set(demoKey, code);

            editor.setValue('', -1);
            await new Promise(resolve => setTimeout(resolve, 50));
            editor.setValue(code, -1);
            editor.clearSelection();
            editor.moveCursorTo(0, 0);

            lastLoadedDemo = demoKey;
            currentDemo = demoKey;

            localStorage.removeItem('tc_code');
            lastSavedCode = '';

            updateEditorInfo();
            updateSaveIndicator();

            Logger.success(`Loaded ${demoKey} demo`);
        } else {
            Logger.error(`Failed to load demo: ${response.status}`);
            alert('Failed to load demo file. Please try again.');
        }
    } catch (e) {
        Logger.error('Error loading demo file', e);
        alert('Error loading demo file: ' + e.message);
    }
}

async function loadDefaultCode() {
    const savedCode = localStorage.getItem('tc_code');
    if (savedCode) {
        editor.setValue(savedCode, -1);
        updateEditorInfo();
        updateSaveIndicator();
        Logger.info('Restored saved code');
        return;
    }

    await loadDemoFile('graphics_demo', false);
}

async function initializeEditor() {
    if (typeof ace === 'undefined') {
        setTimeout(initializeEditor, 100);
        return;
    }

    editor = ace.edit('editor');

    const currentTheme = document.documentElement.getAttribute('data-theme');
    const aceTheme = currentTheme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/textmate';
    editor.setTheme(aceTheme);

    editor.session.setMode('ace/mode/c_cpp');

    editor.setShowPrintMargin(false);
    const editorOptions = {
        fontSize: '16px',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        highlightActiveLine: true,
        showGutter: true,
        tabSize: 4,
        useSoftTabs: true,
        wrap: true
    };

    if (languageToolsAvailable) {
        editorOptions.enableBasicAutocompletion = true;
        editorOptions.enableLiveAutocompletion = true;
        editorOptions.enableSnippets = true;
    }

    editor.setOptions(editorOptions);

    await loadDefaultCode();

    // Debounce editor updates
    const debouncedUpdate = debounce(() => {
        updateEditorInfo();
        updateSaveIndicator();
    }, 500);

    editor.on('change', debouncedUpdate);

    setTimeout(() => {
        editor.focus();
        document.getElementById('editor-wrapper').classList.add('active');
    }, 100);

    Logger.success('Editor ready');
}

// ==================== FOCUS MANAGEMENT ====================

function focusTerminal() {
    if (!dosInstance) return;

    const canvas = document.getElementById('dos-canvas');
    const terminalWrapper = document.getElementById('terminal-wrapper');
    const editorWrapper = document.getElementById('editor-wrapper');
    const keyboardBlocker = document.getElementById('keyboard-blocker');

    terminalFocused = true;
    canvas.focus();
    canvas.tabIndex = 1;
    terminalWrapper.classList.add('terminal-active');
    editorWrapper.classList.remove('active');
    keyboardBlocker.classList.remove('active');
}

function focusEditor() {
    if (!editor) return;

    const canvas = document.getElementById('dos-canvas');
    const terminalWrapper = document.getElementById('terminal-wrapper');
    const editorWrapper = document.getElementById('editor-wrapper');
    const keyboardBlocker = document.getElementById('keyboard-blocker');

    terminalFocused = false;
    canvas.tabIndex = -1;
    canvas.blur();
    editor.focus();
    terminalWrapper.classList.remove('terminal-active');
    editorWrapper.classList.add('active');
    keyboardBlocker.classList.add('active');
}

function setupKeyboardBlocker() {
    keyboardEventBlocker = function (e) {
        if (!terminalFocused) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }
    };

    window.addEventListener('keydown', keyboardEventBlocker, true);
    window.addEventListener('keyup', keyboardEventBlocker, true);
    window.addEventListener('keypress', keyboardEventBlocker, true);
}

// ==================== COMPILATION ERROR CHECKING ====================

async function checkCompilationErrors() {
    const outputPanel = document.getElementById('output-panel');
    const outputContent = document.getElementById('output-content');
    const terminalWrapper = document.getElementById('terminal-wrapper');

    try {
        if (!dosInstance || !dosInstance.em || !dosInstance.em.FS) {
            return;
        }

        const FS = dosInstance.em.FS;
        const filePath = '/TURBOC3/BIN/ERR.TXT';

        try {
            FS.stat(filePath);
        } catch (statErr) {
            return;
        }

        let content;
        try {
            content = FS.readFile(filePath, { encoding: 'utf8' });
        } catch (readErr) {
            const data = FS.readFile(filePath);
            content = new TextDecoder().decode(data);
        }

        if (content && content.trim() !== '' && content !== lastErrorContent) {
            lastErrorContent = content;

            if (content.includes('Error') || content.includes('Fatal')) {
                outputContent.textContent = content;
                outputContent.classList.remove('output-success');
                outputContent.classList.add('output-error');

                if (!outputPanel.classList.contains('visible')) {
                    outputPanel.classList.add('visible');
                    terminalWrapper.classList.add('has-panel');
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
                }
            }
        }
    } catch (e) {
        // Silently ignore
    }
}

// ==================== LOADING PROGRESS ====================

function updateLoadingProgress(percent) {
    const loadingProgressBar = document.getElementById('loading-progress-bar');
    if (loadingProgressBar) {
        loadingProgressBar.style.width = `${percent}%`;
    }
}

// ==================== RUN PROGRAM ====================

async function runProgram() {
    if (!editor) {
        alert('Editor is still loading. Please wait...');
        return;
    }

    const code = editor.getValue();

    if (!code.trim()) {
        alert('Please write some code first!');
        return;
    }

    Logger.info('Starting compilation...');

    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const runBtn = document.getElementById('run-btn');
    const outputPanel = document.getElementById('output-panel');
    const outputContent = document.getElementById('output-content');
    const terminalWrapper = document.getElementById('terminal-wrapper');

    loading.classList.add('active');
    loadingText.textContent = 'Initializing DOS environment...';
    updateLoadingProgress(0);
    runBtn.disabled = true;
    runBtn.classList.add('loading');

    if (dosInstance) {
        try {
            dosInstance.exit();
        } catch (e) {
            Logger.warn('Error closing previous DOS instance');
        }
        dosInstance = null;
    }

    if (errorUpdateInterval) {
        clearInterval(errorUpdateInterval);
        errorUpdateInterval = null;
    }

    outputPanel.classList.remove('visible');
    terminalWrapper.classList.remove('has-panel');
    lastErrorContent = '';
    outputContent.textContent = '';

    try {
        if (typeof Dos === 'undefined') {
            loadingText.textContent = 'Waiting for JS-DOS...';
            updateLoadingProgress(20);
            await new Promise((resolve) => {
                const checkDos = setInterval(() => {
                    if (typeof Dos !== 'undefined') {
                        clearInterval(checkDos);
                        resolve();
                    }
                }, 100);
            });
        }

        updateLoadingProgress(40);

        const canvas = document.getElementById('dos-canvas');

        try {
            canvas.getContext('2d', { willReadFrequently: true });
        } catch (e) {
            // Ignore
        }


        const wdosboxSources = OFFLINE_MODE
            ? CONFIG.WDOSBOX.local
            : [CONFIG.WDOSBOX.cdn, ...CONFIG.WDOSBOX.local];
        const wdosboxCandidates = Array.isArray(wdosboxSources) ? wdosboxSources : [wdosboxSources];

        let wdosboxUrl = wdosboxCandidates[0];
        for (let i = 0; i < wdosboxCandidates.length; i++) {
            const candidate = wdosboxCandidates[i];
            try {
                await fetch(candidate, { method: 'HEAD' });
                wdosboxUrl = candidate;
                break;
            } catch (e) {
                // Try next candidate
            }
        }

        Logger.info(`Using WDOSBOX source: ${wdosboxUrl}`);

        updateLoadingProgress(60);

        Dos(canvas, {
            wdosboxUrl: wdosboxUrl,
            cycles: 'max',
            autolock: false,
        }).ready(async (fs, main) => {

            loadingText.textContent = 'Loading Turbo C++...';
            updateLoadingProgress(70);

            try {
                loadingText.textContent = 'Loading compiler...';
                const tcBlob = await getTCZip();

                const blobUrl = URL.createObjectURL(tcBlob);

                Logger.info('Extracting compiler files...');
                loadingText.textContent = 'Extracting compiler files...';

                await fs.extract(blobUrl);

                URL.revokeObjectURL(blobUrl);

                Logger.success('Turbo C compiler loaded');
            } catch (e) {
                Logger.error('Compiler extraction failed', e);
                throw new Error('Failed to load compiler: ' + e.message);
            }

            loadingText.textContent = 'Writing source code...';
            updateLoadingProgress(80);
            fs.createFile('TURBOC3/BIN/USER.CPP', code);

            const batchScript = `@ECHO OFF
CD TURBOC3\\BIN
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT
TCC -I..\\INCLUDE -L..\\LIB -n. USER.CPP ..\\LIB\\GRAPHICS.LIB > ERR.TXT
IF EXIST USER.EXE GOTO SUCCESS
CLS
ECHO ========================================
ECHO COMPILATION ERRORS:
ECHO ========================================
TYPE ERR.TXT
ECHO.
PAUSE
EXIT
:SUCCESS
CLS
USER.EXE
PAUSE
`;

            fs.createFile('AUTOEXEC.BAT', batchScript);

            loadingText.textContent = 'Starting program...';
            updateLoadingProgress(90);

            dosInstance = await main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT']);

            setupKeyboardBlocker();

            updateLoadingProgress(100);
            loading.classList.remove('active');
            runBtn.disabled = false;
            runBtn.classList.remove('loading');

            Logger.success('Program started successfully');

            setTimeout(() => {
                focusTerminal();
            }, 500);

            errorUpdateInterval = setInterval(() => checkCompilationErrors(), 1000);
        });

    } catch (error) {
        Logger.error('Failed to start DOS environment', error);
        alert('Failed to start DOS environment. Error: ' + error.message);
        loading.classList.remove('active');
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        updateLoadingProgress(0);
    }
}

// ==================== EVENT HANDLERS ====================

function handleResize() {
    if (editor) {
        editor.resize();
        editor.renderer.updateFull();
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function () {
    initializeTheme();

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('save-btn').addEventListener('click', saveCode);
    document.getElementById('run-btn').addEventListener('click', runProgram);

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the editor?')) {
            editor.setValue('', -1);
            localStorage.removeItem('tc_code');
            lastLoadedDemo = '';
            updateEditorInfo();
            updateSaveIndicator();
            Logger.info('Editor cleared');
        }
    });

    document.getElementById('demo-select').addEventListener('change', async (e) => {
        const selectedDemo = e.target.value;

        if (selectedDemo === lastLoadedDemo) {
            Logger.info(`Reloading ${selectedDemo} demo (force refresh)`);
            await loadDemoFile(selectedDemo, true);
        } else {
            currentDemo = selectedDemo;
            await loadDemoFile(selectedDemo, false);
        }
    });

    document.getElementById('fullscreen-editor-btn').addEventListener('click', () => {
        const editorWrapper = document.getElementById('editor-wrapper');
        const terminalWrapper = document.getElementById('terminal-wrapper');

        isEditorFullscreen = !isEditorFullscreen;

        if (isEditorFullscreen) {
            editorWrapper.classList.add('fullscreen');
            terminalWrapper.classList.add('hidden');
        } else {
            editorWrapper.classList.remove('fullscreen');
            terminalWrapper.classList.remove('hidden');
        }

        setTimeout(() => {
            if (editor) {
                editor.resize();
                editor.renderer.updateFull();
            }
        }, 100);
    });

    document.getElementById('fullscreen-terminal-btn').addEventListener('click', () => {
        const editorWrapper = document.getElementById('editor-wrapper');
        const terminalWrapper = document.getElementById('terminal-wrapper');

        isTerminalFullscreen = !isTerminalFullscreen;

        if (isTerminalFullscreen) {
            terminalWrapper.classList.add('fullscreen');
            editorWrapper.classList.add('hidden');
        } else {
            terminalWrapper.classList.remove('fullscreen');
            editorWrapper.classList.remove('hidden');
        }

        setTimeout(() => {
            if (dosInstance) {
                window.dispatchEvent(new Event('resize'));
            }
        }, 100);
    });

    document.getElementById('close-output-btn').addEventListener('click', () => {
        const outputPanel = document.getElementById('output-panel');
        const terminalWrapper = document.getElementById('terminal-wrapper');

        outputPanel.classList.remove('visible');
        terminalWrapper.classList.remove('has-panel');
        window.dispatchEvent(new Event('resize'));
    });

    document.getElementById('copy-error-btn').addEventListener('click', async () => {
        const outputContent = document.getElementById('output-content');
        const copyErrorBtn = document.getElementById('copy-error-btn');
        const copyBtnText = document.getElementById('copy-btn-text');
        const errorText = outputContent.textContent;

        if (!errorText || errorText.trim() === '') {
            return;
        }

        try {
            await navigator.clipboard.writeText(errorText);

            copyErrorBtn.classList.add('copied');
            copyBtnText.textContent = 'Copied!';

            Logger.success('Errors copied to clipboard');

            setTimeout(() => {
                copyErrorBtn.classList.remove('copied');
                copyBtnText.textContent = 'Copy Errors';
            }, 2000);
        } catch (err) {
            Logger.error('Failed to copy errors', err);

            const textArea = document.createElement('textarea');
            textArea.value = errorText;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();

            try {
                document.execCommand('copy');
                copyErrorBtn.classList.add('copied');
                copyBtnText.textContent = 'Copied!';

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

    document.getElementById('expand-output-btn').addEventListener('click', () => {
        const outputPanel = document.getElementById('output-panel');
        const expandOutputBtn = document.getElementById('expand-output-btn');

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

        setTimeout(() => window.dispatchEvent(new Event('resize')), 310);

        Logger.info(`Output panel ${isOutputExpanded ? 'expanded' : 'collapsed'}`);
    });

    document.getElementById('keyboard-blocker').addEventListener('click', () => {
        focusTerminal();
    });

    document.getElementById('terminal-wrapper').addEventListener('click', (e) => {
        const terminalWrapper = document.getElementById('terminal-wrapper');
        const canvas = document.getElementById('dos-canvas');

        if (e.target === terminalWrapper || e.target === canvas) {
            if (dosInstance && !terminalFocused) {
                focusTerminal();
            }
        }
    });

    document.getElementById('editor-wrapper').addEventListener('click', () => {
        focusEditor();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            focusEditor();
            return false;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !terminalFocused) {
            e.preventDefault();
            runProgram();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 's' && !terminalFocused) {
            e.preventDefault();
            saveCode();
        }
    }, true);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(handleResize, 300);
    });

    Logger.info('Initializing compiler...');
    updateSaveIndicator();


    loadAllScripts().then(success => {
        if (success) {
            initializeEditor();
            Logger.success('Compiler ready');
        }
    });
});
