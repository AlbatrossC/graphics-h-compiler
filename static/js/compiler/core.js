// ==================== THEME TOGGLE ====================

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

            // Update Ace editor theme
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

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        // Initialize theme on page load
        initializeTheme();

        // ==================== LOGGER ====================
        const Logger = {
            prefix: '[Graphics.h Compiler]',

            info(msg) {
                console.log(`${this.prefix} ${msg}`);
            },

            success(msg) {
                console.log(`${this.prefix} ✓ ${msg}`);
            },

            error(msg, err) {
                console.error(`${this.prefix} ✗ ${msg}`, err || '');
            },

            warn(msg) {
                console.warn(`${this.prefix} ⚠ ${msg}`);
            }
        };

        // ==================== GLOBAL STATE ====================
        let dosInstance = null;
        let terminalFocused = false;
        let editor = null;
        let currentDemo = 'graphics-demo';
        let lastLoadedDemo = ''; // Track last loaded demo
        let scriptsLoaded = {
            jsdos: false,
            ace: false,
            aceMode: false,
            aceTheme: false
        };

        // ==================== CLOUD STORAGE STATE ====================
        const CLOUD_STATE = {
            storageBaseUrl: '',
            files: new Map(),
            folders: new Set(['main']),
            openTabs: [],
            activeFileKey: 'main/main.cpp',
            autosaveTimer: null,
            isSaving: false,
            lastSavedHash: null,
            lastSavedAt: null
        };

        const AUTOSAVE_DELAY_MS = 7000;

        // Demo files configuration - loaded dynamically from manifest.json
        let DEMO_FILES = {};

        // TC.ZIP URL - loaded dynamically from manifest.json
        let TC_ZIP_URL = null;

        // Initialize resources from manifest
        async function initializeResourcesFromManifest() {
            try {
                await ResourceLoader.init();

                // Load demo files mapping
                DEMO_FILES = await ResourceLoader.getDemoFiles();
                Logger.success('Demo files loaded from manifest');

                // Get TC ZIP URL (will handle fallback automatically)
                TC_ZIP_URL = await ResourceLoader.getResourceUrl('assets', 'tc-zip');
                Logger.success('TC ZIP URL resolved from manifest');
            } catch (error) {
                Logger.error('Failed to initialize resources from manifest', error);
                // Fallback to hardcoded values if manifest fails
                DEMO_FILES = {
                    'graphics-demo': '/compiler-assets/Demo_files/graphics_demo.cpp',
                    'circle-pattern': '/compiler-assets/Demo_files/circle_pattern.cpp',
                    'bouncing-ball': '/compiler-assets/Demo_files/bouncing_ball.cpp',
                    'shooter-game': '/compiler-assets/Demo_files/shooter_game.cpp'
                };
                TC_ZIP_URL = '/compiler-assets/zip-files/tc-v1.zip';
            }
        }

        // ==================== CACHING SYSTEM ====================
        const CACHE_CONFIG = {
            TC_ZIP_CACHE_KEY: 'tc_zip_cache',
            TC_ZIP_VERSION: 'tc-v1',
            DEMO_CACHE_PREFIX: 'demo_cache_',
            CACHE_TTL: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
            DB_NAME: 'GraphicsHCompilerCache',
            DB_VERSION: 1,
            STORE_NAME: 'files'
        };

        // IndexedDB for large file caching (TC ZIP)
        let cacheAvailable = true; // Flag to prevent repeated IndexedDB retries

        class CacheDB {
            static db = null;

            static async open() {
                if (!cacheAvailable) return null; // Don't retry if previously failed
                if (this.db) return this.db;

                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(CACHE_CONFIG.DB_NAME, CACHE_CONFIG.DB_VERSION);

                    request.onerror = () => {
                        cacheAvailable = false; // Mark cache as unavailable
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
                                if (age < CACHE_CONFIG.CACHE_TTL) {
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
        let warmupPromise = null;
        let tcZipPromise = null; // Shared promise to prevent duplicate downloads

        // Shared function to get TC ZIP - prevents race condition between warmup and run
        async function getTCZip() {
            if (tcZipPromise) return tcZipPromise;

            tcZipPromise = (async () => {
                // Try cache first
                let blob = await CacheDB.get(CACHE_CONFIG.TC_ZIP_CACHE_KEY);
                if (blob) {
                    Logger.info('TC ZIP loaded from cache');
                    return blob;
                }

                // Download and cache
                Logger.info('Downloading TC ZIP...');
                const response = await fetch(TC_ZIP_URL);
                if (!response.ok) {
                    throw new Error(`Failed to download compiler (HTTP ${response.status})`);
                }
                blob = await response.blob();

                // Cache for next time (async, don't block)
                CacheDB.set(CACHE_CONFIG.TC_ZIP_CACHE_KEY, blob)
                    .then(cached => {
                        if (cached) Logger.success('TC ZIP cached for future use');
                    });

                return blob;
            })();

            return tcZipPromise;
        }

        // Update cache status indicator on Run button
        async function updateCacheStatus() {
            try {
                const cached = await CacheDB.get(CACHE_CONFIG.TC_ZIP_CACHE_KEY);
                if (cached && runBtn) {
                    runBtn.title = 'Run (cached - instant) [Ctrl+Enter]';
                    Logger.info('Cache status: TC ZIP is cached');
                } else if (runBtn) {
                    runBtn.title = 'Run [Ctrl+Enter]';
                }
            } catch (e) {
                // Silently ignore
            }
        }

        const canvas = document.getElementById("dos-canvas");
        const loading = document.getElementById("loading");
        const loadingText = document.getElementById("loading-text");
        const loadingProgressBar = document.getElementById("loading-progress-bar");
        const runBtn = document.getElementById("run-btn");
        const terminalWrapper = document.getElementById("terminal-wrapper");
        const keyboardBlocker = document.getElementById("keyboard-blocker");
        const editorWrapper = document.getElementById("editor-wrapper");
        const demoSelect = document.getElementById("demo-select");
        const clearBtn = document.getElementById("clear-btn");
        const editorInfo = document.getElementById("editor-info");
        const saveBtn = document.getElementById("save-btn");
        const saveIndicator = document.getElementById("save-indicator");
        const saveText = document.getElementById("save-text");

        // ==================== OUTPUT PANEL HANDLERS ====================

        // Output Panel Elements
        const outputPanel = document.getElementById("output-panel");
        const outputContent = document.getElementById("output-content");
        const closeOutputBtn = document.getElementById("close-output-btn");
        let errorUpdateInterval = null;
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
                copyBtnText.textContent = 'Copied!';

                Logger.success('Errors copied to clipboard');

                // Reset after 2 seconds
                setTimeout(() => {
                    copyErrorBtn.classList.remove('copied');
                    copyBtnText.textContent = 'Copy';
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
                    copyBtnText.textContent = 'Copied!';

                    setTimeout(() => {
                        copyErrorBtn.classList.remove('copied');
                        copyBtnText.textContent = 'Copy';
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

        async function checkCompilationErrors() {
            try {
                // Access Emscripten FS through dosInstance.em (js-dos 6.22)
                if (!dosInstance || !dosInstance.em || !dosInstance.em.FS) {
                    return;
                }

                const FS = dosInstance.em.FS;
                const filePath = "/TURBOC3/BIN/ERR.TXT";

                // Check if file exists
                try {
                    FS.stat(filePath);
                } catch (statErr) {
                    return; // File doesn't exist yet
                }

                // Read the file content
                let content;
                try {
                    content = FS.readFile(filePath, { encoding: 'utf8' });
                } catch (readErr) {
                    const data = FS.readFile(filePath);
                    content = new TextDecoder().decode(data);
                }

                // Only update if content changed and is not empty
                if (content && content.trim() !== "" && content !== lastErrorContent) {
                    lastErrorContent = content;

                    // Check if it contains errors
                    if (content.includes("Error") || content.includes("Fatal")) {
                        outputContent.textContent = content;
                        outputContent.classList.remove('output-success');
                        outputContent.classList.add('output-error');

                        // Show panel only for errors
                        if (!outputPanel.classList.contains('visible')) {
                            outputPanel.classList.add('visible');
                            terminalWrapper.classList.add('has-panel');
                            setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
                        }
                    }
                    // For successful compilation, don't show the panel
                }
            } catch (e) {
                // Silently ignore errors during polling
            }
        }

