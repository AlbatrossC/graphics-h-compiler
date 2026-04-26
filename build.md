# Build Pipeline

`build.py` creates the production compiler assets used by [templates/compiler.html](/c:/Users/jadha/Desktop/graphics.h-online-compiler/templates/compiler.html).

It does four things:

1. Rebuilds `static/js/compiler/codemirror.bundle.v1.js` from:
[build-tools/codemirror/entry.js](/c:/Users/jadha/Desktop/graphics.h-online-compiler/build-tools/codemirror/entry.js)
[build-tools/codemirror/theme.js](/c:/Users/jadha/Desktop/graphics.h-online-compiler/build-tools/codemirror/theme.js)

2. Bundles and minifies all compiler CSS from [static/css/compiler](/c:/Users/jadha/Desktop/graphics.h-online-compiler/static/css/compiler) into one hashed file:
`/static/build/compiler.[hash].css`

3. Bundles and minifies the main compiler runtime JS from [static/js/compiler](/c:/Users/jadha/Desktop/graphics.h-online-compiler/static/js/compiler) into one hashed file:
`/static/build/compiler.[hash].js`

4. Writes [static/build/asset-manifest.json](/c:/Users/jadha/Desktop/graphics.h-online-compiler/static/build/asset-manifest.json), which [app.py](/c:/Users/jadha/Desktop/graphics.h-online-compiler/app.py) reads to inject the correct hashed asset URLs into the compiler page.

## Included CSS

- `base.css`
- `panels.css`
- `sidebar.css`
- `preferences.css`
- `responsive.css`
- `toasts.css`
- Any additional `.css` files added to `static/css/compiler`

## Included JS

- `asset-sources.js`
- `app.js`
- `files-ui.js`
- `files.js`
- `editor.js`
- `shell.js`
- `execution.js`
- `preferences.js`
- `ai-fix.js`
- Any additional `.js` files added to `static/js/compiler` unless excluded in `build.py`

## Excluded From Main JS Bundle

- `static/js/compiler/codemirror.bundle.v1.js`
- `dosbox.js`
- `dosbox.wasm`
- `analytics.js`

`codemirror.bundle.v1.js` stays separate because it is lazy-loaded by [static/js/compiler/editor.js](/c:/Users/jadha/Desktop/graphics.h-online-compiler/static/js/compiler/editor.js). Its source files live in `build-tools/codemirror` because they are build inputs, not directly requested by the webpage. JS-DOS and WDOSBOX also stay separate and are loaded only when needed.

## Runtime Wiring

- [templates/compiler.html](/c:/Users/jadha/Desktop/graphics.h-online-compiler/templates/compiler.html) loads the hashed bundle pair from the asset manifest.
- [app.py](/c:/Users/jadha/Desktop/graphics.h-online-compiler/app.py) falls back to the non-hashed source paths if the manifest does not exist yet.
- [vercel.json](/c:/Users/jadha/Desktop/graphics.h-online-compiler/vercel.json) runs `python build.py` on every deployment.

## Local Usage

```bash
python build.py
```

If raw compiler CSS or JS changes, rerun `python build.py` and new hashed bundle filenames will be generated automatically.
