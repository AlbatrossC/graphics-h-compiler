# Online Graphics.h Compiler - Technical Documentation

**Browser-based Turbo C++ compiler with DOS emulation for graphics.h programming**

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Caching System](#caching-system)
- [Editor Integration](#editor-integration)
- [DOS Emulation](#dos-emulation)
- [Compilation Workflow](#compilation-workflow)
- [Demo System](#demo-system)
- [Theme System](#theme-system)
- [Error Handling](#error-handling)
- [Performance Optimizations](#performance-optimizations)
- [Development Guide](#development-guide)

---

## Overview

The Online Graphics.h Compiler is a web-based development environment that allows users to write, compile, and execute graphics.h programs directly in the browser. It eliminates the need for Turbo C++, DOSBox, or any local installations.

**Live URL:** https://graphics-h-compiler.vercel.app/compiler.html

**Key Capabilities:**
- Full Turbo C++ 3.0 environment running in browser
- Real-time code editing with syntax highlighting
- Instant DOS emulation for graphics rendering
- Persistent code storage
- Pre-loaded demo programs
- Dark/Light theme support

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Window                       │
├─────────────────────────────────────────────────────────┤
│  Header (Navigation, Theme, Demo Selector, Run Button)  │
├──────────────────────┬──────────────────────────────────┤
│                      │                                   │
│   Ace Code Editor    │    DOS Canvas (JS-DOS)           │
│   - Syntax highlight │    - Turbo C++ emulation         │
│   - Auto-complete    │    - Graphics rendering          │
│   - Code persistence │    - Keyboard input              │
│                      │    - Error output panel          │
└──────────────────────┴──────────────────────────────────┘
```

### Technology Layers

**Layer 1: UI Framework**
- Pure HTML5/CSS3/JavaScript
- Responsive design (mobile-friendly)
- No external frameworks (vanilla JS)

**Layer 2: Code Editing**
- Ace Editor (v1.4.12)
- C++ syntax highlighting
- Auto-completion
- Real-time character/line counting

**Layer 3: DOS Emulation**
- JS-DOS 6.22
- Emscripten-compiled DOSBox
- WebAssembly execution
- Turbo C++ 3.0 compiler

**Layer 4: Storage & Caching**
- IndexedDB for large files (TC ZIP)
- LocalStorage for code/demos
- Blob Storage for assets (Vercel)

---

## Features

### Code Editor

**Ace Editor Configuration:**
```javascript
editor.setOptions({
  enableBasicAutocompletion: true,
  enableLiveAutocompletion: true,
  fontSize: "16px",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  highlightActiveLine: true,
  showGutter: true,
  tabSize: 4,
  useSoftTabs: true,
  wrap: true
});
```

**Features:**
- **Syntax Highlighting:** C++ keywords, strings, comments
- **Auto-completion:** Standard library functions
- **Line Numbers:** Visible gutter with active line highlight
- **Code Folding:** Collapse/expand code blocks
- **Multi-cursor:** Edit multiple lines simultaneously
- **Find/Replace:** Built-in search (Ctrl+F)

**Themes:**
- Dark: Monokai (`ace/theme/monokai`)
- Light: Textmate (`ace/theme/textmate`)

**Keyboard Shortcuts:**
- `Ctrl+Enter` / `Cmd+Enter` - Run program
- `Ctrl+S` / `Cmd+S` - Save code
- `Ctrl+F` - Find
- `Ctrl+H` - Replace
- `Esc` - Exit DOS terminal, return to editor

### Demo Programs

**Pre-loaded Examples:**

| Demo | Description | File |
|------|-------------|------|
| Graphics Demo | Basic shapes and patterns | `graphics_demo.cpp` |
| Circle Pattern | Concentric circles animation | `circle-pattern.cpp` |
| Bouncing Ball | Physics simulation | `bouncing-ball.cpp` |
| Shooter Game | Simple shooting game | `shooter-game.cpp` |

**Demo Files Location:**
```
Vercel Blob Storage:
https://ltjlklxc9homgiye.public.blob.vercel-storage.com/demo/
├── graphics_demo.cpp
├── circle-pattern.cpp
├── bouncing-ball.cpp
└── shooter-game.cpp
```

**Demo Loading Process:**
1. Check LocalStorage cache (7-day TTL)
2. If cached → Load instantly
3. If not cached → Fetch from Blob Storage
4. Cache for future use
5. Clear editor
6. Insert demo code
7. Reset cursor to top

**Force Reload:**
Selecting the same demo again triggers a force reload with cache bypass.

---

## Technology Stack

### External Dependencies

**JS-DOS 6.22:**
- **Primary CDN:** `https://js-dos.com/6.22/current/js-dos.js`
- **Fallback:** `./libs/js-dos.js` (local copy)
- **WDOSBOX:** `https://js-dos.com/6.22/current/wdosbox.js`
- **Purpose:** DOS emulation engine

**Ace Editor 1.4.12:**
- **Primary CDN:** `https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.12/`
- **Fallback:** `./libs/` (local copies)
- **Components:**
  - `ace.js` - Core editor
  - `mode-c_cpp.js` - C++ syntax
  - `theme-monokai.js` - Dark theme
  - `theme-textmate.js` - Light theme

**Fonts:**
- **JetBrains Mono** (Google Fonts)
- **Fallbacks:** Fira Code, Consolas, Monaco

### Script Loading Strategy

**Load Order:**
1. JS-DOS → 30% progress
2. Ace Editor → 50% progress
3. Ace C++ Mode → 70% progress
4. Ace Themes → 100% progress

**Fallback Mechanism:**
```javascript
loadScript(primaryUrl, fallbackUrl, timeout = 5000)
  ├─ Try primary CDN with 5s timeout
  ├─ If fails → Try fallback local file
  └─ If both fail → Show error
```

**Benefits:**
- Fast loading from CDN (when available)
- Works offline with local copies
- Resilient to CDN outages

---

## Caching System

### IndexedDB for Large Files

**TC ZIP Caching:**

```javascript
Database: GraphicsHCompilerCache
Version: 1
Store: files

Schema:
{
  key: string,           // 'tc_zip_cache'
  data: Blob,           // TC.ZIP file (~50MB)
  timestamp: number     // Cache creation time
}
```

**Cache Configuration:**
```javascript
TC_ZIP_CACHE_KEY: 'tc_zip_cache'
TC_ZIP_VERSION: 'tc-v1'
CACHE_TTL: 7 days (604,800,000 ms)
```

**TC ZIP Details:**
- **URL:** `https://ltjlklxc9homgiye.public.blob.vercel-storage.com/zips/tc-v1.zip`
- **Size:** ~50 MB
- **Contents:** Turbo C++ 3.0 compiler + graphics.lib
- **First Run:** Downloads and caches
- **Subsequent Runs:** Instant load from IndexedDB

**Cache Workflow:**
```
User clicks Run
    ↓
Check IndexedDB for 'tc_zip_cache'
    ↓
    ├─ Found & Fresh (< 7 days) → Use cached blob
    │                              ↓
    │                          Instant load ⚡
    └─ Not found / Expired
        ↓
    Download from Blob Storage
        ↓
    Show progress (0-100%)
        ↓
    Store in IndexedDB
        ↓
    Use for current run
```

### LocalStorage for Code & Demos

**User Code Persistence:**
```javascript
Key: 'tc_code'
Value: string (user's C++ code)
Max Size: ~5-10 MB (browser limit)
```

**Demo File Cache:**
```javascript
Key Pattern: 'demo_cache_{demoKey}'
Value: {
  code: string,
  timestamp: number
}
TTL: 7 days
```

**Save Indicator Logic:**
```javascript
if (savedCode === currentCode && savedCode !== '')
  → Show "Saved" (green)
else
  → Show "Not Saved" (default)
```

### Cache Invalidation

**Auto-invalidation:**
- 7-day TTL enforced on every access
- Expired entries auto-deleted

**Manual invalidation:**
- Clear browser cache (DevTools)
- Clear site data (Settings → Storage)

**Cache status indicator:**
- Run button tooltip shows cache status
- "Run (cached - instant)" vs "Run"

---

## Editor Integration

### Ace Editor Setup

**Initialization:**
```javascript
editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.session.setMode("ace/mode/c_cpp");
```

**Event Handlers:**

**onChange:**
```javascript
editor.on('change', () => {
  updateEditorInfo();      // Update line/char count
  updateSaveIndicator();   // Check if saved
});
```

**Features:**

**Auto-completion:**
- Triggered by typing or Ctrl+Space
- Suggests C++ keywords, functions
- Context-aware (inside functions, etc.)

**Syntax Validation:**
- Real-time error detection (visual only)
- Actual compilation errors shown in DOS

**Line/Character Count:**
```javascript
const code = editor.getValue();
const lines = code.split('\n').length;
const chars = code.length;

editorInfo.textContent = `Lines: ${lines} | Chars: ${chars}`;
```

### Theme Switching

**Dynamic Theme Update:**
```javascript
function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  // Update HTML attribute
  document.documentElement.setAttribute('data-theme', newTheme);
  
  // Update Ace theme
  const aceTheme = newTheme === 'dark' 
    ? 'ace/theme/monokai' 
    : 'ace/theme/textmate';
  editor.setTheme(aceTheme);
  
  // Persist choice
  localStorage.setItem('theme', newTheme);
}
```

**CSS Variable System:**
```css
:root {
  --vscode-bg: #0a0a0a;
  --primary: #00ff88;
  --text-primary: #fafafa;
}

[data-theme="light"] {
  --vscode-bg: #fafafa;
  --primary: #00cc6a;
  --text-primary: #0a0a0a;
}
```

### Fullscreen Mode

**Editor Fullscreen:**
```javascript
editorWrapper.classList.add('fullscreen');   // Fixed position, 100vw/vh
terminalWrapper.classList.add('hidden');     // display: none

// Force resize after layout change
setTimeout(() => {
  editor.resize();
  editor.renderer.updateFull();
}, 100);
```

**Terminal Fullscreen:**
```javascript
terminalWrapper.classList.add('fullscreen');
editorWrapper.classList.add('hidden');

// Trigger canvas resize
window.dispatchEvent(new Event('resize'));
```

---

## DOS Emulation

### JS-DOS Configuration

**Initialization:**
```javascript
Dos(canvas, {
  wdosboxUrl: "https://js-dos.com/6.22/current/wdosbox.js",
  cycles: "max",        // Maximum CPU speed
  autolock: false       // Don't lock mouse pointer
}).ready((fs, main) => {
  // Setup filesystem and run
});
```

**WDOSBOX Selection:**
- **Online:** Use CDN version (faster updates)
- **Offline:** Fallback to local copy
- **Auto-detection:** 3-second network probe

**Filesystem Setup:**

**Extract TC ZIP:**
```javascript
const tcBlob = await getTCZip();         // From cache or download
const blobUrl = URL.createObjectURL(tcBlob);
await fs.extract(blobUrl);               // Extract to Emscripten FS
URL.revokeObjectURL(blobUrl);            // Cleanup
```

**Result:**
```
/TURBOC3/
├── BIN/
│   ├── TCC.EXE          # Turbo C compiler
│   ├── USER.CPP         # User's code (injected)
│   ├── USER.EXE         # Compiled executable
│   └── ERR.TXT          # Compilation errors
├── INCLUDE/
│   ├── GRAPHICS.H
│   └── ... (standard headers)
└── LIB/
    ├── GRAPHICS.LIB
    └── ... (standard libraries)
```

### Compilation Process

**AUTOEXEC.BAT Script:**
```batch
@ECHO OFF
CD TURBOC3\BIN

REM Clean previous build
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT

REM Compile user code
TCC -I..\INCLUDE -L..\LIB -n. USER.CPP ..\LIB\GRAPHICS.LIB > ERR.TXT

REM Check if compilation succeeded
IF EXIST USER.EXE GOTO SUCCESS

REM Show errors if failed
CLS
ECHO ========================================
ECHO COMPILATION ERRORS:
ECHO ========================================
TYPE ERR.TXT
ECHO.
PAUSE
EXIT

:SUCCESS
REM Run the compiled program
CLS
USER.EXE
PAUSE
```

**Compiler Flags:**
- `-I..\INCLUDE` - Include directory for headers
- `-L..\LIB` - Library directory for linking
- `-n.` - Output to current directory
- `USER.CPP` - Source file
- `..\LIB\GRAPHICS.LIB` - Graphics library

**Error Capture:**
- Redirect stdout to `ERR.TXT`
- Parse errors every 1 second
- Display in output panel if errors found

### Graphics Rendering

**Canvas Setup:**
```javascript
<canvas id="dos-canvas" tabindex="-1"></canvas>
```

**Canvas Styling:**
```css
#dos-canvas {
  width: 100%;
  height: 100%;
  background: #000;
  image-rendering: pixelated;      /* Sharp pixel art */
  image-rendering: crisp-edges;
}
```

**Rendering Pipeline:**
```
User code calls graphics.h functions
    ↓
Turbo C graphics.lib executes
    ↓
DOS video memory writes (VGA mode)
    ↓
DOSBox emulates VGA hardware
    ↓
WDOSBOX converts to WebGL/Canvas2D
    ↓
Browser renders on <canvas>
```

**Supported Graphics Modes:**
- CGA, EGA, VGA (up to 640x480)
- 16-color palette
- Text mode 80x25

---

## Compilation Workflow

### Step-by-Step Execution

**1. User clicks Run button**

**2. Pre-compilation checks:**
```javascript
if (!editor) {
  alert('Editor is still loading');
  return;
}

const code = editor.getValue();
if (!code.trim()) {
  alert('Please write some code first!');
  return;
}
```

**3. UI state updates:**
```javascript
loading.classList.add('active');
loadingText.textContent = 'Initializing DOS environment...';
runBtn.disabled = true;
```

**4. Clean previous instance:**
```javascript
if (dosInstance) {
  dosInstance.exit();      // Terminate previous DOS session
  dosInstance = null;
}
```

**5. Initialize JS-DOS:**
```javascript
Dos(canvas, { ... }).ready(async (fs, main) => {
  // Filesystem operations
});
```

**6. Load Turbo C++ compiler:**
```javascript
const tcBlob = await getTCZip();     // From cache or download
await fs.extract(blobUrl);           // ~50MB extraction
```

**7. Inject user code:**
```javascript
fs.createFile("TURBOC3/BIN/USER.CPP", code);
```

**8. Create batch script:**
```javascript
fs.createFile("AUTOEXEC.BAT", batchScript);
```

**9. Start DOS:**
```javascript
dosInstance = await main(["-conf", "dosbox.conf", "AUTOEXEC.BAT"]);
```

**10. Setup keyboard handling:**
```javascript
setupKeyboardBlocker();    // Prevent accidental keypresses
focusTerminal();           // Focus DOS canvas
```

**11. Monitor for errors:**
```javascript
errorUpdateInterval = setInterval(() => {
  checkCompilationErrors();   // Read ERR.TXT every 1 second
}, 1000);
```

### Progress Tracking

**Loading States:**

| Progress | State | Description |
|----------|-------|-------------|
| 0% | Initializing | Preparing environment |
| 10-30% | Loading deps | JS-DOS, Ace Editor |
| 40% | DOS ready | Dos() instance created |
| 60% | Determining WDOSBOX | Network check |
| 70% | Loading compiler | Fetching TC ZIP |
| 80% | Extracting | Decompressing TC ZIP |
| 90% | Writing code | Creating USER.CPP |
| 100% | Starting | Executing AUTOEXEC.BAT |

**Progress Bar Update:**
```javascript
function updateLoadingProgress(percent) {
  loadingProgressBar.style.width = `${percent}%`;
}
```

---

## Demo System

### Demo File Management

**Demo Configuration:**
```javascript
const DEMO_FILES = {
  'graphics-demo': 'https://.../graphics_demo.cpp',
  'circle-pattern': 'https://.../circle-pattern.cpp',
  'bouncing-ball': 'https://.../bouncing-ball.cpp',
  'shooter-game': 'https://.../shooter-game.cpp'
};
```

**Demo Selector:**
```html
<select id="demo-select" class="demo-dropdown">
  <option value="graphics-demo" selected>Graphics Demo</option>
  <option value="circle-pattern">Circle Pattern</option>
  <option value="bouncing-ball">Bouncing Ball</option>
  <option value="shooter-game">Shooter Game</option>
</select>
```

**Load Logic:**
```javascript
demoSelect.addEventListener('change', async (e) => {
  const selectedDemo = e.target.value;
  
  // Force reload if same demo selected
  if (selectedDemo === lastLoadedDemo) {
    await loadDemoFile(selectedDemo, true);  // Cache bypass
  } else {
    await loadDemoFile(selectedDemo, false);
  }
});
```

**Demo Caching:**
```javascript
async function loadDemoFile(demoKey, forceReload = false) {
  // 1. Check cache (unless force reload)
  if (!forceReload) {
    const cachedCode = DemoCache.get(demoKey);
    if (cachedCode) {
      editor.setValue(cachedCode, -1);
      return;
    }
  }
  
  // 2. Fetch from Blob Storage
  const cacheBuster = forceReload ? `?t=${Date.now()}` : '';
  const response = await fetch(demoUrl + cacheBuster);
  
  // 3. Cache for future use
  const code = await response.text();
  DemoCache.set(demoKey, code);
  
  // 4. Load into editor
  editor.setValue(code, -1);
  editor.clearSelection();
  
  // 5. Update state
  lastLoadedDemo = demoKey;
  localStorage.removeItem("tc_code");  // Clear user save
}
```

**Cache Bypass (Force Reload):**
- Adds timestamp query parameter: `?t=1234567890`
- Bypasses browser and CDN cache
- Ensures fresh copy from origin

---

## Theme System

### CSS Variable Architecture

**Theme Definition:**
```css
:root {
  /* Dark Theme (Default) */
  --vscode-bg: #0a0a0a;
  --vscode-sidebar: #151515;
  --primary: #00ff88;
  --text-primary: #fafafa;
  --border-color: #262626;
}

[data-theme="light"] {
  /* Light Theme */
  --vscode-bg: #fafafa;
  --vscode-sidebar: #f5f5f5;
  --primary: #00cc6a;
  --text-primary: #0a0a0a;
  --border-color: #e0e0e0;
}
```

**Component Styling:**
```css
body {
  background: var(--vscode-bg);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
}

.btn-primary {
  background: var(--primary);
  color: #0a0a0a;
  border-color: var(--primary);
}
```

### Theme Toggle Implementation

**Button:**
```html
<button id="theme-toggle" class="theme-toggle">
  <svg id="theme-icon-dark">...</svg>   <!-- Moon icon -->
  <svg id="theme-icon-light">...</svg>  <!-- Sun icon -->
</button>
```

**Toggle Function:**
```javascript
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  // 1. Update DOM
  document.documentElement.setAttribute('data-theme', newTheme);
  
  // 2. Update Ace Editor
  const aceTheme = newTheme === 'dark' 
    ? 'ace/theme/monokai' 
    : 'ace/theme/textmate';
  editor.setTheme(aceTheme);
  
  // 3. Persist choice
  localStorage.setItem('theme', newTheme);
  
  // 4. Update icon
  updateThemeIcon(newTheme);
}
```

**Icon Update:**
```javascript
function updateThemeIcon(theme) {
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  
  if (theme === 'dark') {
    darkIcon.style.display = 'block';    // Show moon
    lightIcon.style.display = 'none';
  } else {
    darkIcon.style.display = 'none';
    lightIcon.style.display = 'block';   // Show sun
  }
}
```

**Initialization:**
```javascript
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

// Run on page load
initializeTheme();
```

---

## Error Handling

### Compilation Error Detection

**Error File Monitoring:**
```javascript
async function checkCompilationErrors() {
  // Access Emscripten filesystem
  const FS = dosInstance.em.FS;
  const filePath = "/TURBOC3/BIN/ERR.TXT";
  
  // Check if error file exists
  try {
    FS.stat(filePath);
  } catch {
    return;  // File doesn't exist yet
  }
  
  // Read error content
  const content = FS.readFile(filePath, { encoding: 'utf8' });
  
  // Only update if content changed
  if (content && content !== lastErrorContent) {
    lastErrorContent = content;
    
    // Check for actual errors
    if (content.includes("Error") || content.includes("Fatal")) {
      displayErrors(content);
    }
  }
}
```

**Polling Interval:**
```javascript
// Start checking every 1 second after DOS starts
errorUpdateInterval = setInterval(() => {
  checkCompilationErrors();
}, 1000);
```

### Error Display Panel

**Output Panel Structure:**
```html
<div id="output-panel">
  <div class="output-header">
    <div class="output-title">
      <svg>...</svg> Compilation Errors
    </div>
    <div class="output-actions">
      <button id="copy-error-btn">Copy</button>
      <button id="expand-output-btn">Expand</button>
      <button id="close-output-btn">×</button>
    </div>
  </div>
  <div id="output-content" class="output-content"></div>
</div>
```

**Display Function:**
```javascript
function displayErrors(content) {
  outputContent.textContent = content;
  outputContent.classList.add('output-error');
  
  // Show panel
  outputPanel.classList.add('visible');
  terminalWrapper.classList.add('has-panel');
  
  // Adjust canvas height
  window.dispatchEvent(new Event('resize'));
}
```

**Panel Features:**

**Copy Errors:**
```javascript
copyErrorBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(errorText);
  
  // Visual feedback
  copyBtnText.textContent = 'Copied!';
  setTimeout(() => {
    copyBtnText.textContent = 'Copy';
  }, 2000);
});
```

**Expand/Collapse:**
```javascript
expandOutputBtn.addEventListener('click', () => {
  isOutputExpanded = !isOutputExpanded;
  
  if (isOutputExpanded) {
    outputPanel.classList.add('expanded');  // height: 100%
  } else {
    outputPanel.classList.remove('expanded'); // height: 50%
  }
});
```

**Close Panel:**
```javascript
closeOutputBtn.addEventListener('click', () => {
  outputPanel.classList.remove('visible');
  terminalWrapper.classList.remove('has-panel');
});
```

---

## Performance Optimizations

### Background Warmup

**Purpose:** Pre-cache TC ZIP for instant subsequent runs

**Warmup Process:**
```javascript
async function warmupJSDOS() {
  // Wait for JS-DOS to load
  if (typeof Dos === 'undefined') {
    await waitForDos();
  }
  
  // Pre-fetch TC ZIP
  await getTCZip();  // Downloads if not cached
  
  // Pre-cache all demo files
  prefetchDemoFiles();
  
  Logger.success('Warmup complete - Run will be instant!');
}
```

**When to Warmup:**
```javascript
// After editor is ready, start background warmup
setTimeout(() => {
  warmupJSDOS();
}, 500);
```

**Benefits:**
- **First run:** Normal load time (~5-10 seconds)
- **Subsequent runs:** Instant (~1 second)

### Shared TC ZIP Promise

**Problem:** Race condition if user clicks Run during warmup

**Solution:**
```javascript
let tcZipPromise = null;

async function getTCZip() {
  // Reuse existing promise if in progress
  if (tcZipPromise) return tcZipPromise;
  
  tcZipPromise = (async () => {
    // Try cache
    let blob = await CacheDB.get('tc_zip_cache');
    if (blob) return blob;
    
    // Download
    const response = await fetch(TC_ZIP_URL);
    blob = await response.blob();
    
    // Cache async (don't block)
    CacheDB.set('tc_zip_cache', blob);
    
    return blob;
  })();
  
  return tcZipPromise;
}
```

**Benefits:**
- Prevents duplicate downloads
- Works for both warmup and run
- Cache-or-download logic in one place

### Demo Prefetching

**Strategy:**
```javascript
async function prefetchDemoFiles() {
  for (const [key, url] of Object.entries(DEMO_FILES)) {
    // Skip if already cached
    if (DemoCache.get(key)) continue;
    
    try {
      const response = await fetch(url);
      const code = await response.text();
      DemoCache.set(key, code);
    } catch {
      // Silently fail for background prefetch
    }
  }
}
```

**Benefits:**
- Instant demo switching (after first load)
- Reduces network requests
- Works offline after warmup

### Script Loading Optimization

**Parallel Loading:**
```javascript
// Load all scripts concurrently
await Promise.all([
  loadScript(jsDosUrl, jsDosF Fallback),
  loadScript(aceUrl, aceFallback),
  loadScript(aceModeUrl, aceModeFallback),
  loadScript(aceThemeUrl, aceThemeFallback)
]);
```

**Timeout Protection:**
```javascript
function loadScript(url, fallback, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout'));
    }, timeout);
    
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}
```

---

## Development Guide

### Local Development Setup

**Prerequisites:**
- Modern browser (Chrome, Firefox, Edge)
- Local web server (Python, Node.js, or VS Code Live Server)

**File Structure:**
```
graphics-h-compiler/
├── compiler.html           # Main page
├── libs/                   # Fallback scripts
│   ├── js-dos.js
│   ├── wdosbox.js
│   ├── ace.js
│   ├── mode-c_cpp.js
│   ├── theme-monokai.js
│   └── theme-textmate.js
├── static/
│   └── analytics.js        # Optional analytics
└── README.md
```

**Start Local Server:**

**Python:**
```bash
# Python 3
python -m http.server 8000

# Access at http://localhost:8000/compiler.html
```

**Node.js:**
```bash
npx serve

# Access at http://localhost:3000/compiler.html
```

**VS Code:**
- Install "Live Server" extension
- Right-click compiler.html → "Open with Live Server"

### Testing Checklist

**Browser Compatibility:**
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (iOS/macOS)
- [ ] Mobile browsers

**Features to Test:**
- [ ] Code editing (typing, selection)
- [ ] Syntax highlighting
- [ ] Auto-completion
- [ ] Theme switching
- [ ] Demo loading
- [ ] Code save/load
- [ ] Run button (compilation)
- [ ] Graphics rendering
- [ ] Error display
- [ ] Keyboard shortcuts
- [ ] Fullscreen modes
- [ ] Responsive layout (mobile)

**Cache Testing:**
- [ ] First run (download TC ZIP)
- [ ] Second run (cached TC ZIP)
- [ ] Demo caching
- [ ] LocalStorage persistence
- [ ] IndexedDB cleanup (7-day TTL)

### Debugging

**Console Logging:**
```javascript
const Logger = {
  info(msg) { console.log(`[Graphics.h Compiler] ${msg}`); },
  success(msg) { console.log(`[Graphics.h Compiler] ✓ ${msg}`); },
  error(msg, err) { console.error(`[Graphics.h Compiler] ✗ ${msg}`, err); },
  warn(msg) { console.warn(`[Graphics.h Compiler] ⚠ ${msg}`); }
};
```

**Useful Breakpoints:**
- `runProgram()` - Compilation start
- `checkCompilationErrors()` - Error detection
- `loadDemoFile()` - Demo loading
- `getTCZip()` - Cache/download logic

**Browser DevTools:**
- **Console:** View Logger output
- **Network:** Check CDN/Blob Storage requests
- **Application → IndexedDB:** Inspect cached TC ZIP
- **Application → LocalStorage:** View saved code/demos
- **Performance:** Profile JS-DOS overhead

### Common Issues

**Issue: TC ZIP download fails**
- Check Blob Storage URL is accessible
- Verify CORS headers (should allow cross-origin)
- Try disabling ad blockers
- Check browser console for errors

**Issue: Editor not loading**
- Verify Ace scripts loaded (check Network tab)
- Check for JavaScript errors in console
- Ensure `ace` global variable exists

**Issue: DOS not starting**
- Check JS-DOS scripts loaded
- Verify `Dos` global variable exists
- Check console for WebAssembly errors
- Try different browser (Safari has limits)

**Issue: Graphics not rendering**
- Check canvas element exists
- Verify VGA mode initialized
- Check console for rendering errors
- Try simpler graphics program first

---

## API Reference

### Global Functions

**runProgram()**
```javascript
async function runProgram()
```
Compiles and runs the current code in the editor.

**saveCode()**
```javascript
function saveCode()
```
Saves editor content to LocalStorage.

**toggleTheme()**
```javascript
function toggleTheme()
```
Switches between dark and light themes.

**loadDemoFile(demoKey, forceReload)**
```javascript
async function loadDemoFile(demoKey: string, forceReload: boolean = false)
```
Loads a demo file into the editor.

### Global State

**dosInstance**
```javascript
let dosInstance: DosInstance | null = null;
```
Current JS-DOS instance (if running).

**editor**
```javascript
let editor: AceEditor | null = null;
```
Ace Editor instance.

**terminalFocused**
```javascript
let terminalFocused: boolean = false;
```
Whether DOS terminal has keyboard focus.

**currentDemo**
```javascript
let currentDemo: string = 'graphics-demo';
```
Currently selected demo key.

---

## SEO & Analytics

### Meta Tags

**Open Graph:**
```html
<meta property="og:title" content="Graphics.h Online Compiler | Turbo C++ DOS Emulation">
<meta property="og:description" content="Run graphics.h code online...">
<meta property="og:type" content="website">
<meta property="og:url" content="https://graphics-h-compiler.vercel.app/compiler.html">
```

**Twitter Card:**
```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Graphics.h Online Compiler...">
```

### Structured Data

**Schema.org SoftwareApplication:**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Graphics.h Online Compiler",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

### Analytics Integration

**File:** `static/analytics.js`

**Purpose:**
- Track page views
- Monitor feature usage
- Error logging (optional)

**Privacy:**
- No personally identifiable information
- Anonymous usage statistics only
- Can be disabled via browser settings

---

## Browser Support

### Minimum Requirements

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 80+ | Recommended |
| Firefox | 75+ | Recommended |
| Edge | 80+ | Recommended |
| Safari | 13.1+ | Limited WebAssembly support |
| Mobile Safari | 13.4+ | Works but limited performance |
| Chrome Android | 80+ | Works well |

### Feature Support

**Required:**
- WebAssembly
- IndexedDB
- LocalStorage
- Canvas API
- Fetch API
- ES6+ JavaScript

**Optional:**
- Service Workers (for offline)
- Web Workers (for background tasks)

### Known Limitations

**Safari:**
- WebAssembly memory limits (512MB max)
- May fail for very large programs
- Slower than Chrome/Firefox

**Mobile:**
- Keyboard input can be tricky
- Smaller screen estate
- DOS terminal less usable
- Graphics rendering slower

**Recommended:** Use desktop Chrome/Firefox for best experience.

---

**Last Updated:** January 2026  
**Version:** 1.0  
**Live URL:** https://graphics-h-compiler.vercel.app/compiler.html