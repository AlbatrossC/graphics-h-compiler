# standalone_compiler.html — What It Is, How It Was Built, and Why It Exists

## What is it?

`standalone_compiler.html` is a **single self-contained HTML file** that lets anyone compile and run C/C++ programs that use the classic `graphics.h` (BGI) library — directly in a browser, with no internet connection required after the file is downloaded.

It bundles a complete DOS environment (DOSBox via WebAssembly), the Turbo C++ 3.0 compiler, and the BGI graphics library into one file you can open anywhere.

---

## Why it was made

The main project (`graphics.h-online-compiler`) is a web server that must be hosted and running for anyone to use the compiler. This is fine for development and normal use, but it creates a single point of failure:

- The server goes down → nobody can compile
- No internet connection → nobody can compile
- You switch machines or lose access → you lose the tool

The standalone file solves all of these problems. It is the **offline backup** of the entire compiler — no Python, no Flask, no server, no dependencies. Just a browser.

---

## How it was built

The file is produced by running `build_standalone.py`. Here is what that script does, step by step:

### 1. Read and process the CSS

```
static/compiler.css  →  strip unused rules  →  minify  →  inline into <style>
```

- Rules for UI elements that are removed in the standalone (demo selector, save button, home button) are stripped out to keep the file lean.
- The CSS is then minified (comments removed, whitespace collapsed, redundant semicolons removed).
- JetBrains Mono is loaded via a Google Fonts `<link>` tag injected into `<head>`, so the editor and output panel use the correct monospace font when online, with Consolas as the offline fallback.

### 2. Bundle the JavaScript libraries

These are read as plain text and inlined into `<script>` tags:

| File | Purpose |
|---|---|
| `compiler-assets/libs/ace.js` | The Ace code editor |
| `compiler-assets/libs/mode-c_cpp.js` | C/C++ syntax highlighting mode |
| `compiler-assets/libs/theme-monokai.js` | Dark theme for the editor |
| `compiler-assets/libs/theme-textmate.js` | Light theme for the editor |
| `compiler-assets/libs/js-dos.js` | JS-DOS — the DOSBox WebAssembly wrapper |

Any `</script>` strings inside these files are escaped to prevent them from breaking the HTML parser.

### 3. Encode the heavy binary assets as Base64

These are the large assets that make the standalone possible:

| Asset | Encoded as | Size (approx.) |
|---|---|---|
| `wdosbox.js` | Base64 string (decoded at runtime to a Blob URL) | ~500 KB |
| `wdosbox.wasm.js` | Base64 binary | ~1.8 MB |
| `tc-v1.zip` | Base64 binary | ~3.1 MB |

- **`wdosbox.js`** is the DOSBox JavaScript glue layer. It is Base64-encoded and decoded at runtime into a `Blob URL` so the browser accepts it as a module source.
- **`wdosbox.wasm.js`** is the actual DOSBox WebAssembly binary. It is passed directly to the emulator as a `Uint8Array` to skip the network fetch step.
- **`tc-v1.zip`** contains the full Turbo C++ 3.0 installation (compiler, linker, headers, BGI library). It is decoded into a Blob and extracted into the virtual DOS filesystem at runtime.

### 4. Embed the demo source file

`compiler-assets/Demo_files/graphics_demo.cpp` is embedded as a JavaScript template literal. It is loaded into the editor on first launch (unless the user has saved their own code in `localStorage`).

Special characters (backticks, backslashes, `${`) in the C++ source are escaped so they do not break the JS template literal syntax.

### 5. Write the application logic

The entire application JS (`APP_JS`) is written inline in the script. It handles:

- **IndexedDB caching** of the TC ZIP so it only needs to be decoded from Base64 once per browser (cached for 7 days).
- **Theme** (dark/light) toggle, persisted in `localStorage`.
- **Ace editor** initialization with JetBrains Mono, 16px font, C++ syntax highlighting.
- **Run button** — compiles and runs the user's code in a DOSBox instance inside the canvas.
- **Compilation error panel** — polls `ERR.TXT` inside the virtual DOS filesystem and surfaces errors if the EXE was not produced.
- **Keyboard focus management** — prevents the editor from receiving DOS keystrokes and vice versa.
- **`Ctrl+Enter`** to compile and run, **`Ctrl+S`** to save to `localStorage`, **`Escape`** to return focus to the editor.

### 6. Assemble and write the output

Everything is assembled into a single HTML string and written to `standalone_compiler.html`.

---

## Why use it as a backup

| Scenario | Web server | Standalone |
|---|---|---|
| No internet | Fails | Works (after first download) |
| Server is down | Fails | Works |
| Different machine | Needs server running | Open the file |
| Sharing with someone | They need server access | Send them the file |
| No Python/Flask installed | Fails | Works |
| Power outage / no Wi-Fi | Fails | Works |

The standalone file is the single-file insurance policy for the compiler. As long as the browser supports WebAssembly (every modern browser does), the file works.

---

## How to rebuild

```bash
python build_standalone.py
```

This takes roughly 5–15 seconds (mostly the Base64 encoding of the WASM binary and ZIP).

The output `standalone_compiler.html` will be ~7 MB. This is expected — most of that is the Turbo C++ compiler and DOSBox WASM binary, which are unavoidable for a fully offline tool.

---

## What was intentionally removed from the standalone

The standalone strips features that depend on server-side state or add unnecessary weight:

- **Demo selector** — only the `graphics_demo.cpp` is bundled; a dropdown makes no sense for a single-file tool.
- **Save / unsave buttons** — `localStorage` (`Ctrl+S`) is used instead. No server needed.
- **Home button** — there is no "home" in a standalone file.
- **Autocomplete** — removed to keep the file focused and fast.

---

## UI notes

- **Font**: JetBrains Mono — all 4 weights (400/500/600/700) embedded as base64 WOFF2, fully offline
- **Font size**: 16px in the editor
- **Theme**: Dark (Monokai) by default, togglable to Light (TextMate)
- **No gradients or glows** — the UI uses flat colors and neutral shadows only
- **GitHub button** in the header links to the source repository: [AlbatrossC/graphics-h-compiler](https://github.com/AlbatrossC/graphics-h-compiler)
