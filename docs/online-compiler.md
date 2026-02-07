# Online Graphics.h Compiler - Technical Documentation

**Browser-based Turbo C++ compiler with DOS emulation for graphics.h programming**

---

## Table of Contents

- [Overview](#overview)
- [How Turbo C Compiler Works](#how-turbo-c-compiler-works)
- [DOS Emulation & Execution](#dos-emulation--execution)
- [Compilation Workflow](#compilation-workflow)
- [Architecture](#architecture)
- [Backend Code Architecture](#backend-code-architecture)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Caching System](#caching-system)
- [Editor Integration](#editor-integration)
- [Demo System](#demo-system)
- [Theme System](#theme-system)
- [Error Handling](#error-handling)
- [Performance Optimizations](#performance-optimizations)
- [Workers & Cloud Infrastructure](#workers--cloud-infrastructure)
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

## How Turbo C Compiler Works

### Turbo C++ 3.0 Overview

Turbo C++ is a DOS-based C/C++ compiler that was standard for graphics programming in the 1990s. The compiler includes TCC.EXE (the compiler), graphics.lib (graphics library), and GRAPHICS.H (header file). Unlike modern compilers, Turbo C operates entirely within a DOS environment, requiring VGA graphics mode for rendering.

### Compilation Process

**User Code → Turbo C Compiler → Machine Code**

When a user clicks Run, the following compilation steps occur:

1. **Code Injection**: User code is written to USER.CPP in the DOS filesystem (TURBOC3/BIN/ directory)

2. **Compilation Command**: TCC compiler is invoked with specific flags:
   - Include path points to TURBOC3/INCLUDE (where GRAPHICS.H resides)
   - Library path points to TURBOC3/LIB (where GRAPHICS.LIB is located)
   - Output goes to current directory (TURBOC3/BIN/)

3. **Graphics Library Linking**: The graphics.lib is linked with the compiled object code, providing all graphics functions (circle, line, rectangle, etc.)

4. **Executable Generation**: If compilation succeeds (no syntax/semantic errors), USER.EXE is created

5. **Error Capture**: Any compilation errors are written to ERR.TXT for user feedback

### Turbo C Graphics Functions

Graphics programming in Turbo C uses BSP (Borland Screen Package) and VGA mode. Common functions include:

- initgraph() - Initialize graphics mode
- circle() - Draw circles
- line() - Draw lines  
- rectangle() - Draw rectangles
- setcolor() - Change drawing color
- getmaxcolor() - Return max color in mode

These functions are part of graphics.lib and map to VGA hardware operations within DOS.

### VGA Mode (640x480)

Turbo C defaults to 640x480 VGA mode with 16-color palette. Graphics operations directly manipulate DOS video memory, which DOSBox/WDOSBOX then translates to WebGL/Canvas2D for browser rendering.

---

## DOS Emulation & Execution

### JS-DOS & WDOSBOX

The project uses JS-DOS 6.22 as the DOS emulator, which runs DOSBox (compiled to WebAssembly via Emscripten) in the browser. WDOSBOX is the graphics rendering layer that converts VGA video memory into browser canvas output.

### DOS Filesystem Architecture

The DOS environment created by JS-DOS contains /TURBOC3/ directory structure extracted from a ZIP file:

- TURBOC3/BIN/ - Compiler executables (TCC.EXE), user code (USER.CPP), and compiled output (USER.EXE)
- TURBOC3/INCLUDE/ - Header files including GRAPHICS.H
- TURBOC3/LIB/ - Compiled libraries including GRAPHICS.LIB

User code is dynamically injected into TURBOC3/BIN/USER.CPP before compilation starts.

### DOS Execution Flow

**Step 1: Initialize DOS Instance**
JS-DOS creates a new DOS environment in the browser. The WDOSBOX component prepares WebAssembly and graphics subsystem.

**Step 2: Extract Compiler ZIP**
The TC.ZIP file (~50MB) is extracted from cache or downloaded. Contents include the entire Turbo C++ 3.0 environment with compiler, headers, and graphics library.

**Step 3: Setup Filesystem**
User code is written as USER.CPP, and AUTOEXEC.BAT is created with compilation commands.

**Step 4: Run AUTOEXEC.BAT**
DOS executes the batch script which:
- Changes to TURBOC3/BIN directory
- Runs TCC compiler with appropriate flags
- Saves compilation errors to ERR.TXT
- If successful, runs USER.EXE

**Step 5: VGA Output Rendering**
WDOSBOX monitors VGA video memory updates. Graphics calls in USER.EXE write to video memory, WDOSBOX detects these changes and renders them to the browser canvas in real-time.

**Step 6: Program Termination**
When USER.EXE finishes or user presses Esc, DOS terminates and the session ends. The DOS instance is cleaned up to allow new compilations.

### Keyboard Input in DOS

DOS programs receive keyboard input through interrupt handlers. When a user presses keys in the canvas area:

- Keys are intercepted by a keyboard blocker to prevent accidental DOS commands
- Valid input (arrow keys, characters, etc.) is passed to the running program
- Esc key triggers DOS exit and returns to editor

### Memory & CPU Emulation

WDOSBOX runs with cycles=max for maximum CPU speed. Memory allocation is handled by the Emscripten runtime - programs can use up to available heap size (~256MB in most browsers).

### Graphics Rendering Pipeline

Turbo C graphics calls (circle, line, etc.) → GRAPHICS.LIB functions → VGA video memory writes → WDOSBOX detects writes → Canvas output → GPU rendering

---

## Compilation Workflow

### Step-by-Step Execution

**1. User clicks Run button**

**2. Pre-compilation checks**: Verify editor is ready and code is not empty

**3. UI state updates**: Show loading indicator, disable run button

**4. Clean previous instance**: Exit old DOS session if running

**5. Initialize JS-DOS**: Create new DOS environment with WDOSBOX graphics support

**6. Load Turbo C++ compiler**: Fetch TC.ZIP from IndexedDB cache or Blob Storage (~50MB)

**7. Inject user code**: Write code to USER.CPP in DOS filesystem

**8. Create AUTOEXEC.BAT**: Generate batch script with TCC compiler command

**9. Start DOS**: Execute AUTOEXEC.BAT

**10. Setup keyboard handling**: Activate keyboard blocker, focus canvas

**11. Monitor for errors**: Poll ERR.TXT every 1 second for compilation errors

**12. Detect completion**: Auto-detect when USER.EXE finishes, show results

### Progress Tracking

- 0%: Initializing environment
- 10-30%: Loading JS-DOS and dependencies
- 40%: DOS instance created
- 60%: Determining WDOSBOX availability
- 70%: Loading TC.ZIP from cache
- 80%: Extracting compiler files
- 90%: Writing user code to filesystem
- 100%: Executing compilation

### Error Handling During Compilation

TCC compiler writes all output (errors and warnings) to ERR.TXT. A 1-second polling interval reads this file and detects if compilation failed. If errors exist, they are parsed and displayed in the output panel below the DOS canvas.

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

## Backend Code Architecture

### Overview

The compiler backend consists of four core JavaScript modules in `static/js/compiler/` that handle all client-side operations:

**Module Breakdown:**

| Module | Size | Responsibility |
|--------|------|-----------------|
| `core.js` | 300+ lines | Theme, logging, utilities |
| `editor.js` | 340+ lines | Editor initialization, script loading |
| `runtime.js` | 830+ lines | DOS execution, keyboard, fullscreen |
| `storage.js` | 1400+ lines | Auth, caching, cloud save, autosave |

### core.js - Theme & Utilities

Handles dark/light theme switching with localStorage persistence. The Logger provides color-coded console output (info, success, error, warn) for debugging. Themes use CSS variables that dynamically update Ace editor colors and page styling when toggled.

### editor.js - Editor & Resource Loading

Loads external scripts (JS-DOS, Ace Editor) with primary CDN URLs and fallback to local copies in case of network failure. Default timeout is 5 seconds per script. Script loading is sequential with progress updates. Resource manifest from static/manifest.json provides cache control headers and alternate URLs for resilience.

### runtime.js - DOS Execution & Keyboard

Orchestrates the entire compilation and execution flow from user clicking Run to program completion. Manages keyboard input blocking to prevent accidental DOS commands, canvas focus, and Esc key exit handling. Monitors ERR.TXT file every 1 second to detect compilation errors. Toggles editor/terminal fullscreen modes on demand.

### storage.js - Authentication & Cloud Sync

Implements three-tier caching for authentication: client-side token cache (45-minute refresh), Supabase session verification (on demand), and local JWT verification in worker (sub-10ms). Handles file operations with cloud (save/load/list/delete). Implements dual autosave: eager local (every 1s) and lazy cloud (every 2min throttle).

**Performance:** Session cache refresh every 45 minutes instead of standard 15 minutes. Local file list caching provides instant sidebar load (<10ms). Local JWT verification is 20-50x faster than remote.

---

## Features

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
Each script has a 5-second timeout. If primary CDN fails, local fallback is used. If both fail, error is shown.

**Benefits:**
- Fast loading from CDN (when available)
- Works offline with local copies
- Resilient to CDN outages

---

## Caching System

### IndexedDB for Large Files

**TC ZIP Caching:**

Turbo C++ 3.0 compiler (~50MB TC.ZIP) is cached in IndexedDB browser database with 7-day TTL. First run downloads and stores, subsequent runs load instantly from cache.

**Cache Details:**
- Database: GraphicsHCompilerCache
- Store: files
- Key: tc_zip_cache
- TTL: 7 days (604800000 ms)

**TC ZIP File:**
- URL: https://ltjlklxc9homgiye.public.blob.vercel-storage.com/zips/tc-v1.zip
- Size: ~50 MB
- Contents: Turbo C++ 3.0 compiler + graphics.lib
- First Run: Downloads and caches
- Subsequent Runs: Instant load from IndexedDB

**Cache Workflow:**
User clicks Run → Check IndexedDB for cache → If found & fresh, load instantly → If not found/expired, download from Blob Storage → Store in IndexedDB → Use for compilation.

### LocalStorage for Code & Demos

**User Code Persistence:**
Stores user's C++ code with key 'tc_code'. Max size ~5-10 MB (browser limit). Automatically saves on each edit.

**Demo File Cache:**
Demo files cached with key pattern 'demo_cache_{demoKey}'. Includes code content and timestamp. 7-day TTL enforced.

**Save Indicator:**
Shows "Saved" status (green) when current code matches saved code. Resets when user makes edits.

### Cache Invalidation

**Auto-invalidation:** 7-day TTL enforced on every access. Expired entries auto-deleted.

**Manual invalidation:** Users can clear browser cache via DevTools or Settings → Storage.

**Status indicator:** Run button tooltip shows "Run (cached - instant)" if TC ZIP is cached, or just "Run" if fresh download needed.

---

## Editor Integration

### Ace Editor Setup

Creates editor instance with C++ syntax mode (ace/mode/c_cpp). Default theme is Monokai for dark mode, Textmate for light mode. Font: JetBrains Mono with Fira Code and Consolas as fallbacks.

### Theme Switching

Updates HTML data-theme attribute ('dark' or 'light'). Ace editor theme switches between Monokai (dark) and Textmate (light). Theme choice persists to localStorage. CSS variables update page colors dynamically.

### Fullscreen Mode

**Editor Fullscreen:** Hides terminal, expands editor to full viewport. Forces editor resize for layout recalculation.

**Terminal Fullscreen:** Hides editor, expands DOS canvas to full viewport. Canvas resizes to fill available space.

---

## Legacy Notes

### AUTOEXEC.BAT Compilation

The batch script executed during compilation: changes to TURBOC3/BIN directory, deletes previous USER.EXE and ERR.TXT, executes TCC compiler with INCLUDE and LIB paths, captures output to ERR.TXT, checks compilation success, and runs USER.EXE or displays errors.

### Compiler Flags

TCC uses flags: -I (include path), -L (library path), -n (output directory). Source USER.CPP and library GRAPHICS.LIB are explicitly linked for graphics support.

### Canvas Rendering

DOS canvas uses pixelated image rendering for crisp graphics. Black background simulates DOS. WDOSBOX monitors video memory and updates canvas in real-time as graphics functions write data.

---

## Demo System

### Demo File Management

Four demo programs available: Graphics Demo (basic shapes), Circle Pattern (animation), Bouncing Ball (physics), and Shooter Game. Loaded from Blob Storage when selected.

**Demo Selector:** HTML dropdown with options for each demo. Loads selected demo code into editor.

**Load Logic:** Change event listener triggers loadDemoFile(). If same demo selected twice, forces fresh download bypassing cache.

**Demo Caching:** Checks LocalStorage cache first. If not cached, fetches from Blob Storage, stores in cache, and loads into editor. Clears user's previous code on demo load.

**Cache Bypass:** Force reload adds timestamp query parameter to URL, bypassing browser and CDN cache for fresh copy.

---

## Theme System

### CSS Variable Architecture

Dark theme uses dark gray backgrounds (#0a0a0a), neon green accent (#00ff88), and light text. Light theme uses light gray background (#fafafa), dark green accent (#00cc6a), and dark text. CSS variables apply to all page elements dynamically when theme switches.

### Theme Toggle Implementation

Toggle function switches data-theme attribute between 'dark' and 'light'. Updates Ace editor theme (Monokai for dark, Textmate for light). Persists choice to localStorage. Updates icon display (moon for dark, sun for light) on every toggle.

Initialization restores saved theme from localStorage on page load, defaulting to dark if no previous choice.

---

## Error Handling

### Compilation Error Detection

Monitors ERR.TXT file in DOS filesystem every 1 second. When file is created/modified (indicating compilation attempt), reads content and checks for error keywords. If errors detected, parses them and displays in output panel.

**Polling:** Error check interval is 1 second after DOS starts running.

### Error Display Panel

Output panel appears below DOS canvas with buttons for Copy, Expand, and Close. Displays compilation errors in monospace font. Panel can expand to full height for better visibility.

**Panel Features:**
- Copy errors to clipboard with visual feedback
- Expand/collapse to show more or less output
- Close button to hide panel and maximize canvas

---

## Performance Optimizations

### Background Warmup

Pre-caches TC ZIP (~50MB) in background after page load. This ensures subsequent code runs are instant instead of waiting for download.

**Warmup Steps:** Wait for JS-DOS to load, fetch TC ZIP from cache or download, prefetch all demo files.

**Benefits:** First run ~5-10 seconds, subsequent runs ~1 second.

### Shared TC ZIP Promise

Single promise shared across warmup and user compile action. If user clicks Run while warmup downloading, reuses same download promise instead of duplicating request.

**Implementation:** Store tcZipPromise globally. If already loading, return existing promise. Prevents race conditions and redundant downloads.

### Demo Prefetching

Background process fetches all four demo files from Blob Storage and caches locally. Skips demo if already cached. Fails silently if network unavailable (background task).

**Result:** Demo switching is instant after first page load.

### Script Loading Optimization

Loads all scripts (JS-DOS, Ace Editor, C++ mode, themes) in parallel using Promise.all(). Each script has 5-second timeout. Provides 10-30% progress updates during loading. Falls back to local copies if CDN fails.

---

## Cloud Storage & Authentication

### Architecture Overview

Three components work together: Cloudflare Worker provides secure gateway for file operations, R2 Bucket stores user files (organized by user ID), Supabase Auth handles Google OAuth, and client-side caching provides performance.

### Authentication System

#### Worker-Side Local JWT Verification

JWT tokens verified locally in Cloudflare Worker using Web Crypto API. Parses token, validates HMAC-SHA256 signature, and checks expiry. Local verification <10ms versus 200-500ms remote (20-50x faster).

**Setup:** Store SUPABASE_JWT_SECRET in Cloudflare Worker environment via npx wrangler secret put.

**Fallback:** If local verification fails, falls back to remote Supabase verification.

#### Client-Side Session Caching

Client caches access token, expiry time, and user info. Session refresh interval 45 minutes (vs standard 15 minutes). Token expired if current time >= (expiry - 5 min safety buffer).
  loadScript(aceModeUrl, aceModeFallback),
  loadScript(aceThemeUrl, aceThemeFallback)
]);
```

**Timeout Protection:**
---

## Cloud Storage & Authentication

### Architecture Overview

Three components work together: Cloudflare Worker provides secure gateway for file operations, R2 Bucket stores user files (organized by user ID), Supabase Auth handles Google OAuth, and client-side caching provides performance.

### Authentication System

#### Worker-Side Local JWT Verification

JWT tokens verified locally in Cloudflare Worker using Web Crypto API. Parses token, validates HMAC-SHA256 signature, and checks expiry. Local verification <10ms versus 200-500ms remote (20-50x faster).

**Setup:** Store SUPABASE_JWT_SECRET in Cloudflare Worker environment via npx wrangler secret put.

**Fallback:** If local verification fails, falls back to remote Supabase verification.

#### Client-Side Session Caching

Client caches access token, expiry time, and user info. Session refresh interval 45 minutes (vs standard 15 minutes). Token expired if current time >= (expiry - 5 min safety buffer).

**Setup:** Store SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_JWT_SECRET in Cloudflare Worker via npx wrangler secret put commands. Deploy with npm run deploy.

**Fallback:** Tries local JWT verification first. If unavailable, falls back to remote Supabase verification.

**Benefits:** 
- Reduced Supabase API calls (45min refresh vs 15min standard)
- Faster authentication checks
- Better UX with fewer interruptions

### File List Caching

Loads file list from localStorage on page load, providing instant <10ms sidebar render (vs 500ms-2s blank sidebar). User's file explorer updates immediately while fresh data fetches in background. Cache invalidated when user creates/deletes files.

**Performance:** 50-200x faster perceived load time with local cache.

### Hybrid Autosave System

**Strategy: Lazy Cloud, Eager Local**

Local saves to localStorage every 1 second (fast). Cloud saves only every 2 minutes (throttled to reduce API hits). Exit handler guarantees save when user closes tab/window.

**Triggers:** Manual (user clicks Save), Idle (after 2 min inactivity), CompileRun (before compilation), Exit (tab close/hide).

**Benefits:** 75% reduction in cloud write operations, local saves prevent data loss, non-blocking autosave.

### Enhanced Logging & Metrics

Tracks autosave triggers (manual, idle, compileRun, exit) and operations (cloudWrites, cloudSkips, localWrites). Console logs detailed metrics on each save including trigger type, file name, and duration.

### Performance Comparison

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Auth Latency | 200-500ms | <10ms | 20-50x faster |
| Session Refresh | Every 15 min | Every 45 min | 3x less aggressive |
| File Explorer Load | 500ms-2s | <10ms (cached) | 50-200x faster |
| Cloud Write Ops | ~120/hour | ~30/hour | 75% reduction |
| Data Safety | Cloud-dependent | Local + Cloud | Improved |

### Security Considerations

JWT secret stored securely in Cloudflare Worker environment, never exposed to client. File access control ensures users can only access their own files with path traversal protection. CORS headers block unauthorized origins.

---

## Workers & Cloud Infrastructure

### Overview

Two Cloudflare Workers serve as serverless backend: graphics-compiler-users-worker (file operations & JWT auth) and r2-public-assets (demo/system file CDN).

### graphics-compiler-users-worker

**Location:** workers/graphics-compiler-users-worker/

**Purpose:** Secure backend gateway for user file operations and authentication

**Key Features:**

**JWT Authentication:** Verifies tokens locally using Web Crypto API. HMAC-SHA256 signature check and expiry validation. <10ms local verification (50x faster than remote Supabase).

**File Operations:** POST /files/save, GET /files/list, GET /files/:path, DELETE /files/:path

**R2 Bucket:** Stores files in graphics-compiler-users bucket, user_{user_id}/main/ directory structure, supports up to 5GB files, globally replicated.

**LRU Cache:** Bounded memory cache with auto-eviction. Maxsize 10000 entries. Reduces R2 round-trips.

**Setup:** Configure secrets via npx wrangler secret put (USER_FILES_BUCKET, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET). Deploy with npm run deploy.

### r2-public-assets Worker

**Location:** workers/r2-public-assets/

**Purpose:** Public CDN for demo files, system files, and videos

**Key Features:**

**Asset Serving:** GET /demo/, GET /system/, GET /videos/ endpoints serve files from R2 with CORS headers.

**Aggressive Caching:** 1-year cache (Cache-Control: public, max-age=31536000, immutable) for demo files, system files, and videos.

**Content-Type Detection:** Detects file type and sets appropriate Content-Type header (cpp → text/plain, zip → application/zip, mp4 → video/mp4, etc.).

**CORS Headers:** Allows cross-origin requests from compiler page. Supports OPTIONS preflight for browser CORS check.

**Path Validation:** No path traversal allowed. Only serves files from designated buckets.

**Demo File:** URL format https://r2-assets.graphics-compiler.workers.dev/demo/graphics_demo.cpp. Fetches from R2, caches at Cloudflare Edge for 1 year, compresses with Brotli for bandwidth.

### Architecture Flow

**File Save Flow:** Browser sends POST /files/save with JWT token → Worker verifies JWT locally → Validates path (no path traversal) → Uploads to R2 → Returns success → Client caches in LRU.

**Asset Serve Flow:** Browser requests GET /demo/... → Worker checks edge cache → If 1-year cache hit, return immediately → If cache miss, fetch from R2, cache at edge, return to client.

### Performance Impact

| Component | Benefit | Impact |
|-----------|---------|--------|
| **JWT Local Verification** | No Supabase round-trip | <10ms (vs 200-500ms remote) |
| **LRU Cache** | Reduces R2 calls | ~20-30% fewer requests |
| **Public Assets Cache** | 1-year immutable cache | Instant CDN serves @ edge |
| **Cloudflare Edge** | Geographically distributed | <100ms response globally |
| **CORS Headers** | Browser direct requests | No CORS-induced delays |

### Deployment

**Deploy Both Workers:**

```bash
# User files worker
cd workers/graphics-compiler-users-worker
npx wrangler deploy

# Assets worker
cd ../r2-public-assets
npx wrangler deploy

# Verify deployment
curl https://graphics-compiler-users-worker.username.workers.dev/health
curl https://r2-assets.graphics-compiler.workers.dev/demo/graphics_demo.cpp
```

**Environment Variables (graphics-compiler-users-worker):**
```bash
USER_FILES_BUCKET            # R2 bucket name
SUPABASE_URL                 # Supabase project URL
SUPABASE_ANON_KEY            # Public API key
SUPABASE_JWT_SECRET          # JWT signing secret (for local verification)
PROD_ORIGIN                  # https://graphics-h-compiler.vercel.app
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

**Python:** python -m http.server 8000. Access at http://localhost:8000/compiler.html

**Node.js:** npx serve. Access at http://localhost:3000/compiler.html

**VS Code:** Install "Live Server" extension, right-click compiler.html → "Open with Live Server"

### Testing Checklist

**Browser Compatibility:** Chrome/Edge, Firefox, Safari, Mobile browsers

**Features to Test:** Code editing, syntax highlighting, auto-completion, theme switching, demo loading, code save/load, Run button, graphics rendering, error display, keyboard shortcuts, fullscreen modes, responsive layout.

**Cache Testing:** First run (download TC ZIP), second run (cached), demo caching, LocalStorage persistence, IndexedDB cleanup (7-day TTL).

### Debugging

**Console Logging:** Logger object provides info(), success(), error(), warn() methods with colored output prefixed with [Graphics.h Compiler].

**Useful Breakpoints:** runProgram() (compilation start), checkCompilationErrors() (error detection), loadDemoFile() (demo loading), getTCZip() (cache/download logic).

**Browser DevTools:** Console (Logger output), Network tab (CDN/Blob requests), ApplicationIndexedDB (cached TC ZIP), Application→LocalStorage (saved code/demos), Performance (JS-DOS profiling).

### Common Issues

**TC ZIP download fails:** Check Blob Storage URL accessible, verify CORS headers, disable ad blockers, check console for errors.

**Editor not loading:** Verify Ace scripts in Network tab, check console for JS errors, ensure ace global variable exists.

**DOS not starting:** Check JS-DOS loaded, verify Dos global exists, check console for WebAssembly errors, try different browser (Safari has limits).

**Graphics not rendering:** Check canvas exists, verify VGA mode initialized, check console errors, try simpler program.

---

## API Reference

### Global Functions

**runProgram():** async function runProgram() - Compiles and runs current editor code.

**saveCode():** function saveCode() - Saves editor content to LocalStorage.

**toggleTheme():** function toggleTheme() - Switches between dark and light themes.

**loadDemoFile():** async function loadDemoFile(demoKey: string, forceReload: boolean = false) - Loads demo file into editor.

### Global State

**dosInstance:** let dosInstance: DosInstance | null = null - Current JS-DOS instance (if running).

**editor:** let editor: AceEditor | null = null - Ace Editor instance.

**terminalFocused:** let terminalFocused: boolean = false - Whether DOS terminal has keyboard focus.

**currentDemo:**
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

**Last Updated:** February 2026  
**Version:** 2.0  
**Live URL:** https://graphics-h-compiler.vercel.app/compiler.html
