# Code Editor — Architecture & Reference

> Complete technical reference for the CodeMirror 6 editor used in the graphics.h online compiler.

---

## Table of Contents

1. [Overview](#overview)
2. [File Map](#file-map)
3. [The Bundle System](#the-bundle-system)
4. [Loading Sequence](#loading-sequence)
5. [Editor Initialization](#editor-initialization)
6. [Compartment Architecture](#compartment-architecture)
7. [Deferred Heavy Extensions](#deferred-heavy-extensions)
8. [Autocompletion System](#autocompletion-system)
9. [Theme Engine](#theme-engine)
10. [Settings Panel Integration](#settings-panel-integration)
11. [Editor Wrapper API](#editor-wrapper-api)
12. [Change Tracking & Autosave](#change-tracking--autosave)
13. [Cross-Module Communication](#cross-module-communication)
14. [Cache Busting](#cache-busting)
15. [How To: Common Tasks](#how-to-common-tasks)

---

## Overview

The editor is built on **CodeMirror 6**, a modular code editor framework. Unlike a monolithic library, CM6 is split into dozens of small NPM packages (`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-cpp`, etc.). We pre-bundle all of them into a single local ES module file so the browser loads one request instead of 9+.

Key design goals:
- **Instant interactivity** — the editor renders and becomes editable before anything else (JS-DOS, TC.zip) loads.
- **Zero CDN dependency** — all CodeMirror code lives locally; no `esm.sh` or `cdn.jsdelivr.net` imports at runtime.
- **Dynamic reconfiguration** — every user-visible setting (theme, font size, word wrap, line numbers, autocomplete, bracket matching, active line highlighting) can be toggled at runtime without destroying and recreating the editor.

---

## File Map

```
project root
├── esbuild.mjs                          # Build script that compiles the bundle
├── package.json                         # NPM deps for CodeMirror + esbuild
│
├── static/js/
│   ├── codemirror.bundle.v1.js          # OUTPUT: the pre-built bundle (do NOT edit)
│   │
│   └── compiler/
│       ├── cm-entry.js                  # Bundle entry point (imports + re-exports)
│       ├── theme-engine.js              # Theme definitions & apply logic
│       ├── editor.js                    # Editor init, autocomplete, change tracking
│       ├── settings.js                  # Settings panel UI & dynamic reconfiguration
│       ├── core.js                      # Shared constants, Logger, DOM refs
│       ├── storage.js                   # Cloud/local file management
│       └── runtime.js                   # JS-DOS runtime, init() entry, keyboard shortcuts
│
└── templates/
    └── compiler.html                    # HTML shell, loads scripts in order
```

### Script load order in `compiler.html`

```html
<script src="/static/js/compiler/core.js"></script>       <!-- 1. Constants, Logger, DOM refs -->
<script src="/static/js/compiler/storage.js"></script>     <!-- 2. File management -->
<script src="/static/js/compiler/editor.js"></script>      <!-- 3. Editor definition -->
<script src="/static/js/compiler/runtime.js"></script>     <!-- 4. JS-DOS + init() -->
<script src="/static/js/compiler/settings.js"></script>    <!-- 5. Settings panel -->
```

All scripts are plain `<script>` tags (not `type="module"`). They share the global scope. The bundle itself is loaded dynamically via `import()` inside `editor.js`.

---

## The Bundle System

### Why bundle?

CodeMirror 6 is distributed as bare-specifier NPM packages (`@codemirror/view`, `@lezer/highlight`, etc.). Browsers cannot resolve bare specifiers natively. Options:
1. Use a CDN like `esm.sh` — adds 9+ network requests and a CDN dependency.
2. Bundle locally with esbuild — one file, zero external requests, tree-shaken, minified.

We use option 2.

### Entry point: `cm-entry.js`

This file imports every CodeMirror package we need and our local `theme-engine.js`, then re-exports them as named namespace objects:

```js
import * as cmCore from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as cmCpp from '@codemirror/lang-cpp';
import * as cmCommands from '@codemirror/commands';
import * as cmAutocomplete from '@codemirror/autocomplete';
import * as cmSearch from '@codemirror/search';
import * as lezerHighlight from '@lezer/highlight';
import * as themeEngine from './theme-engine.js';

export {
    cmCore, cmView, cmLanguage, cmCpp, cmCommands,
    cmAutocomplete, cmSearch, lezerHighlight, themeEngine
};
```

### Build script: `esbuild.mjs`

```js
import * as esbuild from 'esbuild';

esbuild.build({
    entryPoints: ['static/js/compiler/cm-entry.js'],
    bundle: true,
    outfile: 'static/js/codemirror.bundle.v1.js',
    format: 'esm',
    minify: true,
    treeShaking: true,
    sourcemap: false,
    target: ['es2020'],
});
```

Run from the project root:

```bash
node esbuild.mjs
```

**Output:** `static/js/codemirror.bundle.v1.js` (~300 KB minified)

### NPM dependencies (`package.json`)

```
@codemirror/autocomplete   ^6.20.1
@codemirror/commands        ^6.10.2
@codemirror/lang-cpp        ^6.0.3
@codemirror/language        ^6.12.2
@codemirror/search          ^6.6.0
@codemirror/state           ^6.5.4
@codemirror/view            ^6.39.16
@lezer/highlight            ^1.2.3
esbuild                     ^0.27.3
```

> **Rule:** Never edit `codemirror.bundle.v1.js` directly. Always modify the source files and rebuild.

---

## Loading Sequence

The boot process is orchestrated by two functions across two files:

### Phase 1 — `init()` in `runtime.js`

```
init()
  └─ await loadAllScripts()   ← defined in editor.js
       ├─ await initializeResourcesFromManifest()
       ├─ await loadCodeMirror()          ← imports the bundle
       ├─ initializeEditor()              ← synchronous, creates the editor
       └─ Promise.all([                   ← background, non-blocking
              loadScript('jsdos'),
              getTCZip()
          ])
  └─ warmupJSDOS()
  └─ updateCacheStatus()
```

Key design: `initializeEditor()` runs **before** JS-DOS and TC.zip are loaded. The user can start typing immediately while the compiler environment downloads in the background.

### Phase 2 — `loadCodeMirror()` in `editor.js`

Dynamically imports the local bundle and maps every exported namespace to handy keys on the global `cmModules` object:

```js
const bundle = await import('/static/js/codemirror.bundle.v1.js');

cmModules = {
    cm:          bundle.cmCore,
    view:        bundle.cmView,
    state:       bundle.cmCore,       // state and core are the same package
    language:    bundle.cmLanguage,
    cpp:         bundle.cmCpp,
    commands:    bundle.cmCommands,
    autocomplete: bundle.cmAutocomplete,
    search:      bundle.cmSearch,
    highlight:   bundle.lezerHighlight,
    themeEngine: bundle.themeEngine
};
```

`cmModules` is a global variable that every other script (`settings.js`, `runtime.js`) reads from.

---

## Editor Initialization

`initializeEditor()` in `editor.js` does the following in order:

### 1. Destructure required CM6 APIs from `cmModules`

```js
const { EditorView, keymap, lineNumbers, highlightActiveLine, ... } = cmModules.view;
const { EditorState, Compartment } = cmModules.state;
const { cpp } = cmModules.cpp;
// etc.
```

### 2. Read user settings

Reads saved settings from `localStorage` via `loadAppSettings()` (defined in `core.js`). Falls back to sensible defaults:

| Setting           | Default    |
|-------------------|------------|
| `theme`           | `vscode-dark` |
| `fontSize`        | `14`       |
| `wordWrap`        | `true`     |
| `lineNumbers`     | `true`     |
| `autocomplete`    | `true`     |
| `bracketMatching` | `true`     |
| `activeLine`      | `true`     |

### 3. Create Compartments

Seven `Compartment` instances are created for every reconfigurable feature (see next section).

### 4. Define custom autocomplete source

Sets up `customCompletionSource` with BGI functions, constants, C++ keywords, and a snippet (see Autocompletion section).

### 5. Build the extensions array

Only **essential** extensions are included at startup:
- Line numbers
- Active line highlighting
- Draw selection overlay
- Indent on input
- C++ language support (`cpp()`)
- Default keymap + `indentWithTab`
- Theme compartment (initially empty `[]`, applied right after)
- Font size compartment
- Static font/layout theme (JetBrains Mono, 100% height, auto scroll)
- Tab size = 4
- Word wrap compartment
- Heavy features compartment (initially empty `[]`, filled via `requestIdleCallback`)

### 6. Create the `EditorView`

```js
cmView = new EditorView({
    state: EditorState.create({ doc: '', extensions }),
    parent: document.getElementById('editor')
});
```

### 7. Apply initial theme

```js
themeEngine.applyTheme(cmView, themeCompartment, initialThemeName);
```

### 8. Create the editor wrapper

`editor = createEditorWrapper(cmView)` — provides `.getValue()`, `.setValue()`, `.setFontSize()`, `.focus()`, etc. (see Editor Wrapper API).

### 9. Fire and forget: load default code

```js
loadDefaultCode(); // No await — editor renders instantly with empty doc
```

### 10. Defer heavy extensions

Scheduled via `requestIdleCallback` (see Deferred Heavy Extensions).

### 11. Set up change listener

Adds an `EditorView.updateListener` that tracks dirty flags and triggers debounced autosave.

### 12. Dispatch `editor-ready` event

```js
document.dispatchEvent(new CustomEvent('editor-ready', { detail: { cmView } }));
```

`settings.js` listens for this to apply saved settings on top of the initialized editor.

---

## Compartment Architecture

CodeMirror 6 uses `Compartment` objects to allow dynamic reconfiguration of individual extensions without recreating the entire editor state.

Each compartment wraps one feature. To change the feature at runtime, you dispatch a reconfigure effect:

```js
cmView.dispatch({
    effects: someCompartment.reconfigure(newExtensionOrEmpty)
});
```

### Active compartments

| Compartment              | Controls                                   | Reconfigured by     |
|--------------------------|--------------------------------------------|--------------------|
| `themeCompartment`       | Editor theme (colors, syntax highlighting) | `settings.js`      |
| `fontSizeCompartment`    | `.cm-content` and `.cm-gutters` font size  | `settings.js`, header buttons |
| `wordWrapCompartment`    | `EditorView.lineWrapping` on/off           | `settings.js`      |
| `lineNumbersCompartment` | `lineNumbers()` on/off                    | `settings.js`      |
| `autocompleteCompartment`| `closeBrackets()` + `autocompletion()`     | `settings.js`      |
| `bracketMatchCompartment`| `bracketMatching()` on/off                 | `settings.js`      |
| `activeLineCompartment`  | `highlightActiveLine()` + gutter on/off    | `settings.js`      |
| `heavyFeaturesCompartment`| All deferred extensions (see below)       | `editor.js` once   |

All compartment variables (`themeCompartment`, `fontSizeCompartment`, etc.) are declared at the module (global) scope in `editor.js`, so `settings.js` can access them directly.

---

## Deferred Heavy Extensions

To keep the editor interactive as fast as possible, expensive extensions are **not** included in the initial `EditorState.create()` call. Instead, they are loaded after the browser is idle:

```js
const executeHeavyFeatures = () => {
    const heavyExtensions = [
        bracketMatchCompartment.of(bracketMatching()),
        autocompleteCompartment.of([
            closeBrackets(),
            autocompletion({
                activateOnTyping: true,
                override: [customCompletionSource]
            })
        ]),
        history(),
        highlightSelectionMatches(),
        keymap.of([
            ...closeBracketsKeymap,
            ...historyKeymap
        ])
    ];

    cmView.dispatch({
        effects: heavyFeaturesCompartment.reconfigure(heavyExtensions)
    });
};

if (window.requestIdleCallback) {
    window.requestIdleCallback(executeHeavyFeatures);
} else {
    setTimeout(executeHeavyFeatures, 300);
}
```

This means:
- The editor is **visible and editable** within milliseconds.
- Autocomplete, history (undo/redo), bracket matching, and search highlighting activate ~300ms later when the browser is idle.

---

## Autocompletion System

### Data sources

Three arrays defined inside `initializeEditor()`:

| Array            | Contents                                           | Count |
|------------------|-----------------------------------------------------|-------|
| `BGI_FUNCTIONS`  | All graphics.h function names (`arc`, `circle`, …) | 74    |
| `BGI_CONSTANTS`  | BGI color constants (`BLACK`, `BLUE`, `WHITE`, …)  | 16    |
| `CPP_KEYWORDS`   | Full C++ keyword list (`int`, `for`, `class`, …)   | 88    |

### `customCompletionSource(context)`

This function is registered as an `override` on the `autocompletion()` extension:

1. Matches the current word being typed via `context.matchBefore(/\w*/)`.
2. Converts the typed text to lowercase and filters each array using **case-insensitive** prefix matching (`fn.toLowerCase().startsWith(lower)`). This means typing `Cir` will correctly suggest `circle`.
3. Returns completion options with appropriate `type` labels (`"function"`, `"constant"`, `"keyword"`).
4. Functions include a trailing `()` via their `apply` property.
5. If the user types `main`, a **snippet** is offered that expands into a full `graphics.h` boilerplate with an interactive cursor tabstop (`${1}` syntax).

### Cross-module sharing

`customCompletionSource` is exported to the global scope:

```js
window.customCompletionSource = customCompletionSource;
```

This is necessary because `settings.js` needs the exact same function reference when re-applying the autocomplete compartment (e.g., when the user toggles autocomplete off then on again). Without this, toggling would lose the custom completions and fall back to CM6's default behavior.

### Snippet syntax

CodeMirror 6 uses `${n}` for snippet tabstops (same as VS Code). Example:

```js
snippetCompletion("int main() {\n    ${1}\n    return 0;\n}", {
    label: "main",
    detail: "graphics boilerplate",
    type: "snippet"
});
```

---

## Theme Engine

### File: `theme-engine.js`

This file is bundled into the main bundle via `cm-entry.js`. It is **not** loaded separately at runtime.

### Available themes

| Key              | Name              | Dark? |
|------------------|-------------------|-------|
| `vscode-dark`    | VS Code Dark      | Yes   |
| `vscode-light`   | VS Code Light     | No    |
| `monokai`        | Monokai           | Yes   |
| `github-dark`    | GitHub Dark       | Yes   |
| `solarized-dark` | Solarized Dark    | Yes   |
| `one-dark`       | One Dark Pro      | Yes   |

### Theme data structure

Each theme in `THEME_DATA` contains:

```js
{
    dark: true,               // CM6 dark mode flag
    bg: 'transparent',        // Editor background
    fg: '#f8f8f2',            // Default text color
    cursor: '#00ff88',        // Cursor color
    activeLine: '#1a1a1a',    // Active line background
    gutterBg: '#151515',      // Gutter background
    gutterFg: '#a0a0a0',      // Gutter text color
    gutterBorder: '#262626',  // Gutter right border
    selection: 'rgba(...)',   // Selection background
    matchBracketBg: '...',    // Matching bracket background
    matchBracketOutline: '...', // Matching bracket outline
    highlights: [             // Lezer syntax highlighting tags
        { tag: tags.keyword, color: '#f92672' },
        { tag: tags.string,  color: '#e6db74' },
        // ...
    ]
}
```

All theme data is `Object.freeze()`-d at module load to prevent accidental mutation.

### Compilation & caching

`compileTheme(themeName)` converts the raw theme data into CM6 extensions (`EditorView.theme()` + `syntaxHighlighting()`). Results are cached in a `Map` so each theme is compiled only once.

### `applyTheme(cmView, themeCompartment, themeName)`

The public API. Uses a `WeakMap` keyed by the `EditorView` to track the currently active theme per view. If the requested theme is already active, it short-circuits (no-op). Otherwise it dispatches a `themeCompartment.reconfigure()`.

### Adding a new theme

1. Add an entry to `THEME_DATA` in `theme-engine.js` with all required fields.
2. Add its key string to the `THEME_NAMES` array.
3. Add a `<option>` in the theme `<select>` in `compiler.html`.
4. Rebuild: `node esbuild.mjs`.

---

## Settings Panel Integration

### File: `settings.js`

Wrapped in an IIFE to avoid polluting the global scope. Accesses the global `cmModules`, `cmView`, and compartment variables from `editor.js`.

### How settings use `cmModules` directly

`settings.js` does **not** import the bundle separately. It reads `cmModules.themeEngine`, `cmModules.view`, `cmModules.autocomplete`, etc., from the global variable that `editor.js` populated during `loadCodeMirror()`.

### Settings ↔ Compartment mapping

| Setting toggle       | Calls                 | Compartment reconfigured         |
|----------------------|-----------------------|----------------------------------|
| Editor Theme         | `applyEditorTheme()`  | `themeCompartment`               |
| Font Size            | `applyFontSize()`     | `fontSizeCompartment`            |
| Word Wrap            | `applyWordWrap()`     | `wordWrapCompartment`            |
| Line Numbers         | `applyLineNumbers()`  | `lineNumbersCompartment`         |
| Autocomplete         | `applyAutocomplete()` | `autocompleteCompartment`        |
| Bracket Matching     | `applyBracketMatching()` | `bracketMatchCompartment`     |
| Active Line          | `applyActiveLine()`   | `activeLineCompartment`          |

### `applyAutocomplete(enabled)`

When enabled, reconfigures the autocomplete compartment with the **full** autocomplete setup (matching what `editor.js` does during init):

```js
autocompleteCompartment.reconfigure(enabled ? [
    closeBrackets(),
    autocompletion({
        activateOnTyping: true,
        override: [window.customCompletionSource]
    })
] : [])
```

### Lifecycle

1. On page load, `settings.js` calls `syncUIFromSettings()` to populate the settings panel checkboxes/selects with the current `localStorage` values.
2. When `editor.js` dispatches the `editor-ready` event, `settings.js` calls `applySavedSettings()` which applies all stored preferences to the live editor.
3. When the user changes a setting, the change is applied instantly via compartment reconfigure, and persisted to `localStorage`.

---

## Editor Wrapper API

The rest of the codebase (`storage.js`, `runtime.js`) was originally written for Ace Editor. To avoid rewriting all call sites, `createEditorWrapper(view)` returns a compatibility object:

| Method               | What it does                                 |
|----------------------|----------------------------------------------|
| `getValue()`         | Returns `view.state.doc.toString()`          |
| `setValue(text)`     | Dispatches a full document replacement       |
| `clearSelection()`   | Moves cursor to position 0                  |
| `moveCursorTo(l, c)` | Moves cursor to line `l`, column `c`        |
| `focus()`            | Calls `view.focus()`                         |
| `setFontSize(str)`   | Reconfigures `fontSizeCompartment`           |
| `resize()`           | Calls `view.requestMeasure()`                |
| `requestMeasure()`   | Calls `view.requestMeasure()`                |
| `on(event, cb)`      | No-op with a warning log                    |
| `renderer.updateFull()` | Calls `view.requestMeasure()`             |
| `setTheme()`         | No-op (themes handled by compartment now)   |

The global `editor` variable holds this wrapper. `cmView` holds the raw `EditorView` instance.

---

## Change Tracking & Autosave

An `EditorView.updateListener` is appended to the editor state (not via compartment — it uses `StateEffect.appendConfig` so it persists across all reconfigurations):

```js
EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    // Immediately set dirty flag
    DIRTY_FLAG.isDirty = true;

    // FAST PATH: save to localStorage immediately
    if (isUserLoggedIn) {
        setLocalDraft(folder, filename, update.state.doc.toString());
        scheduleAutosave();
    }

    // SLOW PATH: debounce UI updates (150ms)
    // updateEditorInfo() and updateSaveIndicator()
});
```

This two-speed approach ensures data safety (writes to localStorage on every keystroke) while keeping the UI responsive (debounces the line/char counter and save indicator updates).

---

## Cross-Module Communication

The editor system uses DOM `CustomEvent`s for loose coupling between `editor.js` and `settings.js`:

| Event name                          | Dispatched by   | Listened by    | Purpose                              |
|-------------------------------------|-----------------|----------------|--------------------------------------|
| `editor-ready`                      | `editor.js`     | `settings.js`  | Signals settings to apply saved prefs |
| `editor-settings-changed`          | `settings.js`   | `editor.js`    | Updates font size display in header  |
| `editor-font-size-change-requested`| `editor.js`     | `settings.js`  | Header +/- buttons request font change |
| `ui-theme-toggled`                 | `core.js`       | `settings.js`  | Site-wide theme toggle syncs editor  |
| `request-show-explorer`            | `runtime.js`    | `settings.js`  | Activity bar navigates back to files |

---

## Cache Busting

Static JS files are loaded with a version query parameter to bypass browser and CDN caches when code changes:

```html
<script src="/static/js/compiler/editor.js?v=codemirror_v1"></script>
```

The bundle also has a `modulepreload` hint in `index.html`:

```html
<link rel="modulepreload" href="/static/js/codemirror.bundle.v1.js?v=codemirror_v1">
```

The `vercel.json` is configured with aggressive caching (`max-age=31536000, immutable`) for `/static/(.*)` routes, so the `?v=` parameter is the mechanism for invalidation.

**When updating any editor JS file, bump the version string** in `compiler.html`.

---

## How To: Common Tasks

### Add a new CodeMirror extension

1. `npm install @codemirror/some-package`
2. Add `import * as cmSomething from '@codemirror/some-package';` to `cm-entry.js`
3. Add `cmSomething` to the `export {}` block in `cm-entry.js`
4. Run `node esbuild.mjs`
5. Access it in `editor.js` via `cmModules.something`

### Add a new editor theme

1. Add a theme data object to `THEME_DATA` in `theme-engine.js`
2. Export its name constant and add it to `THEME_NAMES`
3. Add a `<option>` to the theme `<select>` in `compiler.html`
4. Rebuild: `node esbuild.mjs`

### Add a new autocompletion keyword

Add the string to the appropriate array inside `initializeEditor()`:
- `BGI_FUNCTIONS` — for `graphics.h` function names
- `BGI_CONSTANTS` — for BGI color/style constants
- `CPP_KEYWORDS` — for C++ language keywords

No rebuild needed (these are in `editor.js`, not in the bundle).

### Add a new user-configurable setting

1. Add a new `Compartment` variable in `editor.js`
2. Add default value to `defaultEditorSettings` in `editor.js` and `SETTINGS_DEFAULTS` in `settings.js`
3. Include the compartment in the initial extensions array
4. Write an `applyXxx()` function in `settings.js` that reconfigures the compartment
5. Add UI controls in `compiler.html` and wire them up in `settings.js`

### Rebuild the bundle

```bash
node esbuild.mjs
```

Always rebuild after modifying `cm-entry.js`, `theme-engine.js`, or updating any `@codemirror/*` package version.
