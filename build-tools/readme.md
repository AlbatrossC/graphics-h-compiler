# Build Tools

This folder contains the small scripts that turn the source site into the deployable `dist/` folder.

## How to use these tools

Normally, do not run files in this folder directly. Run the project build from the repository root:

```bash
npm run build
```

That command runs:

```bash
python build-tools/build.py
```

`build-tools/build.py` uses the files in this folder in this order:

1. `build-tools/codemirror-entry.js` is passed to esbuild to regenerate the CodeMirror browser bundle.
2. Compiler CSS and JavaScript source files are bundled into hashed files in `site/static/build/`.
3. `build-tools/render.py` is imported and its `render_site(...)` function renders the final static site into `dist/`.

Use `python build-tools/build.py` directly only when you want the same build without going through npm.

## `codemirror-entry.js`

`codemirror-entry.js` is the esbuild entry point for the browser editor bundle.

The main build script (`build-tools/build.py`) passes this file to esbuild, which bundles the CodeMirror 6 packages from `node_modules` into:

```text
site/static/js/compiler/codemirror.bundle.v1.js
```

The app lazy-loads that bundle from `site/static/js/compiler/editor.js`, so CodeMirror stays separate from the main compiler bundle. This keeps the initial compiler asset smaller and lets the editor load only when the compiler page needs it.

The entry file only imports and re-exports the CodeMirror modules used by the editor:

- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/language`
- `@codemirror/lang-cpp`
- `@codemirror/commands`
- `@codemirror/search`
- `@codemirror/autocomplete`
- `@lezer/highlight`

To add another CodeMirror package, install it with npm, import it here, export it from the final `export { ... }` block, and run `npm run build`.

## `render.py`

`render.py` renders the Jinja2 templates in `site/templates/` into static HTML files in `dist/`.

It is called by `build-tools/build.py` after CSS and JavaScript have been bundled. The renderer:

- Reads environment-backed public config such as `SITE_DOMAIN`, `PUBLIC_ASSETS_URL`, and `PUBLIC_API_URL`.
- Loads the compiler asset manifest from `site/static/build/asset-manifest.json`.
- Loads docs reference data from `site/static/assets/docs.1.json` for the compiler page.
- Renders static pages such as `index.html`, `compiler.html`, `contact.html`, `404.html`, and policy pages.
- Generates `dist/sitemap.xml`.
- Copies required static assets, compiler runtime files, root files, `_headers`, and `_redirects` into `dist/`.

When the build uses hashed compiler bundles, `render.py` skips the unbundled compiler source CSS and JavaScript during the static copy step. The deployed `dist/` folder still includes the files that are required at runtime, including the hashed compiler bundle, the CodeMirror bundle, analytics, JSON data, fonts, images, videos, and DOS runtime assets.

Template render failures are collected and raised as a build error, so a broken page cannot quietly produce a partial deploy.

For local debugging, you can also import and call the renderer from Python after compiler assets exist:

```python
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / "build-tools"))

import render

render.render_site({
    "css_urls": ["/static/build/compiler.example.css"],
    "js_urls": ["/static/build/compiler.example.js"],
})
```

In normal development, prefer `npm run build` because it creates the real asset manifest and passes the correct hashed asset URLs automatically.

