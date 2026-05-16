# Editor — CodeMirror 6 Integration

> How the code editor works, how it is built, and how to build it locally.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Packages Used](#packages-used)
- [Build Pipeline (esbuild)](#build-pipeline-esbuild)
- [Bundle Entry Point](#bundle-entry-point)
- [How the Editor Loads](#how-the-editor-loads)
- [Editor Wrapper API](#editor-wrapper-api)
- [Compartments (Dynamic Reconfiguration)](#compartments-dynamic-reconfiguration)
- [Syntax Theme (VS Code–style)](#syntax-theme-vs-code-style)
- [Autocomplete System](#autocomplete-system)
  - [Data Source](#data-source)
  - [Context Detection](#context-detection)
  - [Completion Types](#completion-types)
  - [Tooltip System](#tooltip-system)
  - [Toggle Support](#toggle-support)
- [Additional Editor Features](#additional-editor-features)
- [Settings & Preferences](#settings--preferences)
- [Change Listener & Autosave](#change-listener--autosave)
- [Build Locally](#build-locally)

---

## Overview

The editor is built on **CodeMirror 6** — a modular, extensible code editor framework for the web. It replaces the earlier Ace Editor and provides C++ syntax highlighting, bracket matching, autocomplete, hover tooltips, and full keyboard-driven editing. The entire CodeMirror setup is bundled into a single ESM file (`codemirror.bundle.v1.js`) that is **lazy-loaded** at runtime via a dynamic `import()`.

---

## Architecture

```
build-tools/codemirror/
└── entry.js                  ← esbuild entry point (re-exports all CM packages)

static/js/compiler/
├── codemirror.bundle.v1.js   ← production bundle (output of esbuild, ~530 KB minified)
├── editor.js                 ← editor initialization, wrapper API, CM view creation
├── autocomplete.js           ← context-aware autocomplete + hover tooltip system
└── preferences.js            ← settings panel that reconfigures the editor live

static/css/compiler/
├── base.css                  ← CSS custom properties for syntax colours (--syn-*)
└── panels.css                ← editor panel layout, loading overlay
```

The key design decision is **separation of build input from runtime output**:

- `build-tools/codemirror/entry.js` is the **build input** — it imports all CodeMirror npm packages and re-exports them as a single namespace.
- `static/js/compiler/codemirror.bundle.v1.js` is the **build output** — a tree-shaken, minified ESM bundle served to the browser.
- `editor.js` is the **runtime glue** — it `import()`s the bundle, creates the `EditorView`, and exposes a wrapper API used by the rest of the compiler.

---

## Packages Used

All CodeMirror packages are installed via npm and declared in `package.json`:

| Package | Version | Purpose |
|---|---|---|
| `@codemirror/state` | ^6.6.0 | Core editor state management (`EditorState`, `Compartment`, `StateEffect`) |
| `@codemirror/view` | ^6.41.1 | View layer (`EditorView`, `keymap`, `lineNumbers`, `drawSelection`) |
| `@codemirror/language` | ^6.12.3 | Language infrastructure (`syntaxHighlighting`, `bracketMatching`, `indentOnInput`) |
| `@codemirror/lang-cpp` | ^6.0.3 | C/C++ language support (syntax tree, parsing) |
| `@codemirror/commands` | ^6.10.3 | Default keybindings, `indentWithTab`, `history`, `historyKeymap` |
| `@codemirror/search` | ^6.7.0 | `highlightSelectionMatches` |
| `@codemirror/autocomplete` | ^6.20.1 | Autocompletion dropdown UI |
| `@lezer/highlight` | ^1.2.3 | Syntax highlight tag system |
| `esbuild` | ^0.21.5 | Bundler (dev dependency) |

**Font:**
| Package | Purpose |
|---|---|
| `@fontsource-variable/jetbrains-mono` | JetBrains Mono variable font (self-hosted, not CDN) |

---

## Build Pipeline (esbuild)

The CodeMirror bundle is built by `build.py` which calls esbuild via Node.js:

```python
# build.py → build_codemirror_bundle()
esbuild.buildSync({
    entryPoints: ['build-tools/codemirror/entry.js'],
    bundle: true,
    outfile: 'static/js/compiler/codemirror.bundle.v1.js',
    format: 'esm',
    minify: true,
    treeShaking: true,
    sourcemap: false,
    target: ['es2020'],
});
```

**Key options:**
- `format: 'esm'` — the output is an ES module so it can be lazy-loaded with `import()`.
- `treeShaking: true` — unused exports from CodeMirror packages are removed.
- `minify: true` — the bundle is minified for production.
- `sourcemap: false` — no source maps in production.

---

## Bundle Entry Point

The entry point is `build-tools/codemirror/entry.js`:

```js
import * as cmCore from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as cmCpp from '@codemirror/lang-cpp';
import * as cmCommands from '@codemirror/commands';
import * as cmSearch from '@codemirror/search';
import * as cmAutocomplete from '@codemirror/autocomplete';
import * as lezerHighlight from '@lezer/highlight';

export {
    cmCore, cmView, cmLanguage, cmCpp,
    cmCommands, cmSearch, cmAutocomplete, lezerHighlight,
};
```

Each package is re-exported under a namespace. The runtime code (`editor.js`) accesses them as `bundle.cmCore`, `bundle.cmView`, etc.

---

## How the Editor Loads

The loading sequence is defined in `editor.js → loadAllScripts()`:

```
1. initializeResourcesFromManifest()     — resolve asset URLs
2. loadCodeMirror()                       — dynamic import() of codemirror.bundle.v1.js
3. initializeEditor()                     — create EditorView + extensions
4. loadDefaultCode()                      — restore draft from IndexedDB / load demo
5. ensureDosRunnerFrame()                 — mount the DOS iframe
6. startPreload()                         — background-cache WASM + tc.zip
```

**Lazy loading detail:**

```js
// editor.js — top level (starts immediately, before anything else)
const editorPromise = import('/static/js/compiler/codemirror.bundle.v1.js');

async function loadCodeMirror() {
    const bundle = await editorPromise;
    cmModules = {
        cm: bundle.cmCore,
        view: bundle.cmView,
        state: bundle.cmCore,
        language: bundle.cmLanguage,
        cpp: bundle.cmCpp,
        commands: bundle.cmCommands,
        search: bundle.cmSearch,
        autocomplete: bundle.cmAutocomplete,
        highlight: bundle.lezerHighlight
    };
}
```

The `import()` is fired at module evaluation time (top of file), so the network fetch begins before any other initialization code runs. By the time `loadCodeMirror()` is called, the bundle may already be in the browser cache.

---

## Editor Wrapper API

CodeMirror 6 has a different API from Ace/CodeMirror 5. To avoid rewriting every other module (`files.js`, `execution.js`, etc.), an adapter wrapper is created:

```js
function createEditorWrapper(view) {
    return {
        getValue()           — returns full document text
        setValue(text)        — replaces entire document
        clearSelection()     — deselects, moves cursor to 0
        moveCursorTo(line, col) — 0-based line/col positioning
        focus()              — focuses the editor
        setFontSize(sizeStr) — reconfigures font via compartment
        resize()             — triggers CM relayout
        requestMeasure()     — alias for view.requestMeasure()
    };
}
```

The global `editor` variable used everywhere in the codebase is this wrapper, **not** the raw `EditorView`.

---

## Compartments (Dynamic Reconfiguration)

CodeMirror 6 uses **Compartments** to swap extensions at runtime without recreating the editor. The following compartments are created in `initializeEditor()`:

| Compartment | Controls |
|---|---|
| `editorStyleCompartment` | VS Code syntax theme |
| `fontSizeCompartment` | Font size (10–32px) |
| `wordWrapCompartment` | Word wrap on/off |
| `lineNumbersCompartment` | Line numbers on/off |
| `bracketMatchCompartment` | Bracket matching on/off |
| `activeLineCompartment` | Active line highlight on/off |
| `heavyFeaturesCompartment` | History, selection matching (deferred via `requestIdleCallback`) |

**Deferred heavy features:** To keep the editor interactive as fast as possible, heavy extensions (history, bracket matching, selection highlights) are loaded via `requestIdleCallback` after the editor is visible:

```js
const executeHeavyFeatures = () => {
    const heavyExtensions = [
        bracketMatchCompartment.of(bracketMatching()),
        history(),
        highlightSelectionMatches(),
        createSelectedMatchHighlightExtension(),
        keymap.of([...historyKeymap])
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

---

## Syntax Theme (VS Code–style)

The syntax highlighting uses CSS custom properties defined in `static/css/compiler/base.css`:

| Token | CSS Variable | Default Colour |
|---|---|---|
| Keywords | `--syn-keyword` | Blue |
| Names / variables | `--syn-name` | Light text |
| Type names | `--syn-type` | Teal |
| Properties / functions | `--syn-property` | Yellow |
| Strings | `--syn-string` | Orange |
| Numbers | `--syn-number` | Green |
| Comments | `--syn-comment` | Grey |
| Preprocessor | `--syn-meta` | Purple |

The theme is applied via `createVsCodeEditorStyleExtension()` in `editor.js`, which creates both an `EditorView.theme()` (for structural styles) and a `HighlightStyle.define()` (for syntax token colours).

---

## Autocomplete System

The autocomplete logic lives entirely in `static/js/compiler/autocomplete.js`.

### Data Source

Function metadata is loaded from `/static/assets/functions.2.json` — a JSON file containing:
- `functions[]` — each with `name`, `info` (signature, description, params), `cursor` (where to place cursor after insert), and `accepts` (which constant groups each parameter accepts).
- `constants{}` — grouped constant values (e.g., colour constants, line styles).

```js
async function loadData() {
    const response = await fetch('/static/assets/functions.2.json');
    const data = await response.json();
    for (const func of data.functions) {
        functionsMap[func.name] = func;
    }
    if (data.constants) {
        for (const [key, values] of Object.entries(data.constants)) {
            constantsMap[key] = values;
        }
    }
}
```

### Context Detection

The `detectContext(state, pos)` function determines what kind of completions to show based on where the cursor is:

1. **Outside parentheses** → show function names
2. **Inside parentheses** → identify which function, which parameter index (by counting commas), and show constants accepted for that parameter

```
setcolor(|)        → constants context: funcName="setcolor", paramIndex=0
circle(100, 100, |) → constants context: funcName="circle", paramIndex=2
set|               → functions context: prefix="set"
```

The algorithm scans left from the cursor, tracking parenthesis nesting depth, to find the nearest unmatched `(`.

### Completion Types

| Context | What is shown | Icon |
|---|---|---|
| `functions` | All function names from `functionsMap` | `ƒ` (purple italic) |
| `constants` | Constants from the function's `accepts[paramIndex]` groups | `[c]` (cyan monospace) |

When a function is selected from the dropdown:
1. The function name + `()` is inserted.
2. The cursor is placed inside or after the parentheses depending on `func.cursor`.
3. A tooltip is shown via `showSelectionTooltip` state effect.

### Tooltip System

Two tooltip sources exist:

1. **Hover tooltip** — when you hover over a function name, a tooltip card appears showing signature, description, and parameters. Triggered after 80ms hover delay.
2. **Selection tooltip** — when a function is picked from autocomplete, the same tooltip appears at the cursor. Dismissed on mouse click or doc change.

The tooltip UI is a custom DOM element with classes:
- `.cm-func-tooltip` — the card container
- `.tooltip-signature` — function signature header
- `.tooltip-description` — function description
- `.tooltip-params` — parameter list with name → description formatting

### Toggle Support

Autocomplete and hover tooltips can be toggled independently from the Settings panel. Each is controlled by its own `Compartment`:

```js
const autocompleteCompartment = new Compartment();
const tooltipCompartment = new Compartment();

// Toggle at runtime:
editorView.dispatch({
    effects: [
        autocompleteCompartment.reconfigure(enableAc ? acExtension : []),
        tooltipCompartment.reconfigure(enableTt ? ttExtension : [])
    ]
});
```

---

## Additional Editor Features

### Auto-bracket Closing

The `createBracketClosingExtension()` function provides:
- **Auto-pair insertion:** typing `(`, `[`, `{`, `"`, or `'` inserts the closing character and places the cursor between them.
- **Skip-over:** typing a closing character when the next character matches skips over it instead of inserting a duplicate.
- **Paired deletion:** pressing Backspace between matched pairs deletes both characters.
- **Smart Enter:** pressing Enter between `{}` / `[]` / `()` splits the brackets with proper indentation.

### Selection Match Highlighting

A custom `ViewPlugin` (`createSelectedMatchHighlightExtension`) highlights the currently selected text range with a decoration class `.cm-selectionMatch-main`, making it visually distinct.

### Mobile Auto-fullscreen

On viewports ≤ 768px, clicking/focusing the editor content area automatically triggers fullscreen editor mode for a better mobile editing experience.

---

## Settings & Preferences

The settings panel (`preferences.js`) provides UI controls that reconfigure the editor via compartments:

| Setting | Storage Key | Default | Effect |
|---|---|---|---|
| Font Size | `editor.fontSize` | 16 | Reconfigures `fontSizeCompartment` |
| Word Wrap | `editor.wordWrap` | true | Reconfigures `wordWrapCompartment` with `EditorView.lineWrapping` |
| Line Numbers | `editor.lineNumbers` | true | Reconfigures `lineNumbersCompartment` with `lineNumbers()` |
| Bracket Matching | `editor.bracketMatching` | true | Reconfigures `bracketMatchCompartment` with `bracketMatching()` |
| Active Line | `editor.activeLine` | true | Reconfigures `activeLineCompartment` with `highlightActiveLine()` |
| Autocomplete | `editor.autocomplete` | true | Reconfigures `autocompleteCompartment` |
| Hover Tooltips | `editor.hoverTooltips` | true | Reconfigures `tooltipCompartment` |

Settings are persisted to `localStorage` under the key `editor_settings` as a JSON object.

---

## Change Listener & Autosave

Every document change is tracked via `EditorView.updateListener`:

```
docChanged
  ├── FAST PATH: write to IndexedDB immediately (setLocalDraftImmediate)
  ├── Schedule 20-second idle autosave (scheduleAutosave)
  └── SLOW PATH: debounce UI updates (150ms)
         ├── updateEditorInfo()  — "Lines: X | Chars: Y"
         └── updateSaveIndicator() — save status badge
```

- **IndexedDB** is the primary storage for guest users (replaced the old `localStorage` `tc_code` key).
- **Cloud autosave** is triggered for logged-in users after 20 seconds of inactivity.
- Old `localStorage` drafts are migrated to IndexedDB automatically on first load.

---

## Build Locally

### Prerequisites

- **Node.js** (v18+)
- **Python** (3.10+)
- **npm packages** installed

### Steps

```bash
# 1. Install npm dependencies (CodeMirror packages + esbuild)
npm install

# 2. Install Python dependencies (for the minifiers)
pip install rcssmin rjsmin

# 3. Run the build
python build.py
```

This will:
1. Rebuild `static/js/compiler/codemirror.bundle.v1.js` from `build-tools/codemirror/entry.js` using esbuild.
2. Bundle and minify all CSS from `static/css/compiler/` → `static/build/compiler.[hash].css`.
3. Bundle and minify all JS from `static/js/compiler/` → `static/build/compiler.[hash].js`.
4. Write `static/build/asset-manifest.json` with the hashed file URLs.

### Adding a New CodeMirror Extension

1. Install the npm package: `npm install @codemirror/your-extension`
2. Add the import to `build-tools/codemirror/entry.js`.
3. Re-export it in the `export { ... }` block.
4. Run `python build.py` to rebuild the bundle.
5. Use it in `editor.js` via `cmModules.yourExtension`.

---

*Last updated: May 2026*
