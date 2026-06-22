from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable

from rcssmin import cssmin
from rjsmin import jsmin

import render


ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / "site"
STATIC_DIR = SITE_DIR / "static"
BUILD_DIR = STATIC_DIR / "build"
CSS_DIR = STATIC_DIR / "css" / "compiler"
JS_DIR = STATIC_DIR / "js" / "compiler"
CODEMIRROR_ENTRY = Path(__file__).resolve().parent / "codemirror-entry.js"
CODEMIRROR_BUNDLE = JS_DIR / "codemirror.bundle.v1.js"
ASSET_MANIFEST = BUILD_DIR / "asset-manifest.json"
LANDING_CSS = STATIC_DIR / "css" / "index.css"
LANDING_CSS_MIN = STATIC_DIR / "css" / "index.min.css"
LITE_YOUTUBE_DIR = STATIC_DIR / "vendor" / "lite-youtube-embed"
LITE_YOUTUBE_CSS = LITE_YOUTUBE_DIR / "lite-yt-embed.css"
LITE_YOUTUBE_JS = LITE_YOUTUBE_DIR / "lite-yt-embed.js"
LITE_YOUTUBE_JS_MIN = LITE_YOUTUBE_DIR / "lite-yt-embed.min.js"


CSS_PRIORITY = [
    "base.css",
    "panels.css",
    "sidebar.css",
    "preferences.css",
    "responsive.css",
]

JS_PRIORITY = [
    "app.js",
    "files-ui.js",
    "files.js",
    "autocomplete.js",
    "editor.js",
    "shell.js",
    "execution.js",
    "preferences.js",
]

EXCLUDED_JS = {
    "codemirror.bundle.v1.js",
    "js-dos-loader.js",
    "dosbox.js",
    "dosbox.wasm",
}


def relative_to_root(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def ordered_files(directory: Path, priority: list[str], suffix: str, excluded: set[str] | None = None) -> list[Path]:
    excluded = excluded or set()
    available = {
        path.name: path
        for path in directory.glob(f"*{suffix}")
        if path.name not in excluded
    }

    ordered = [available.pop(name) for name in priority if name in available]
    ordered.extend(sorted(available.values(), key=lambda path: path.name))
    return ordered


def bundle_text(
    files: list[Path],
    minifier: Callable[[str], str],
    source_comment: Callable[[str], str],
    separator: str,
) -> str:
    chunks: list[str] = []

    for file_path in files:
        chunks.append(source_comment(relative_to_root(file_path)))
        chunks.append(file_path.read_text(encoding="utf-8").strip())
        chunks.append(separator)

    return minifier("\n".join(chunks))


def css_source_comment(relative_path: str) -> str:
    return f"/* Source: {relative_path} */"


def js_source_comment(relative_path: str) -> str:
    return f"// Source: {relative_path}"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def write_hashed_asset(prefix: str, extension: str, content: str) -> str:
    hashed_name = f"{prefix}.{content_hash(content)}.{extension}"
    output_path = BUILD_DIR / hashed_name
    output_path.write_text(content, encoding="utf-8", newline="\n")
    return f"/static/build/{hashed_name}"


def clean_compiler_build_outputs() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    for pattern in ("compiler.*.css", "compiler.*.js"):
        for path in BUILD_DIR.glob(pattern):
            path.unlink()


def node_command() -> list[str]:
    node_path = shutil.which("node")
    if not node_path:
        raise RuntimeError("Node.js is required to rebuild the CodeMirror bundle.")
    return [node_path]


def build_codemirror_bundle() -> None:
    build_script = "\n".join([
        "const esbuild = require('esbuild');",
        "esbuild.buildSync({",
        f"  entryPoints: ['{CODEMIRROR_ENTRY.as_posix()}'],",
        "  bundle: true,",
        f"  outfile: '{CODEMIRROR_BUNDLE.as_posix()}',",
        "  format: 'esm',",
        "  minify: true,",
        "  treeShaking: true,",
        "  sourcemap: false,",
        "  target: ['es2020'],",
        "});",
        "console.log('CodeMirror bundle rebuilt.');",
    ])

    subprocess.run(node_command() + ["-e", build_script], cwd=ROOT, check=True)


def build_compiler_bundle() -> dict[str, object]:
    css_files = ordered_files(CSS_DIR, CSS_PRIORITY, ".css")
    js_files = ordered_files(JS_DIR, JS_PRIORITY, ".js", EXCLUDED_JS)

    css_bundle = bundle_text(css_files, cssmin, css_source_comment, "")
    js_bundle = bundle_text(js_files, jsmin, js_source_comment, ";")

    return {
        "css": write_hashed_asset("compiler", "css", css_bundle),
        "js": write_hashed_asset("compiler", "js", js_bundle),
        "css_sources": [relative_to_root(path) for path in css_files],
        "js_sources": [relative_to_root(path) for path in js_files],
    }





def write_asset_manifest(compiler_assets: dict[str, object]) -> dict[str, object]:
    manifest = {
        "compiler": compiler_assets,
        "separate": {
            "codemirror_bundle": "/static/js/compiler/codemirror.bundle.v1.js",
            "lazy_loaded": [
                "/static/js/compiler/codemirror.bundle.v1.js",
                "/libs/js-dos.js",
                "/libs/wdosbox.js",
                "/libs/wdosbox.wasm",
                "/static/js/analytics.js",
            ],
        },
    }

    ASSET_MANIFEST.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest


def build_assets() -> dict[str, object]:
    clean_compiler_build_outputs()
    build_codemirror_bundle()
    build_landing_page_assets()
    compiler_assets = build_compiler_bundle()
    return write_asset_manifest(compiler_assets)


def build_landing_page_assets() -> None:
    landing_css = "\n".join([
        css_source_comment(relative_to_root(LITE_YOUTUBE_CSS)),
        LITE_YOUTUBE_CSS.read_text(encoding="utf-8"),
        css_source_comment(relative_to_root(LANDING_CSS)),
        LANDING_CSS.read_text(encoding="utf-8"),
    ])
    LANDING_CSS_MIN.write_text(cssmin(landing_css), encoding="utf-8", newline="\n")

    LITE_YOUTUBE_JS_MIN.write_text(
        jsmin(LITE_YOUTUBE_JS.read_text(encoding="utf-8")),
        encoding="utf-8",
        newline="\n",
    )


def render_dist(manifest: dict[str, object]) -> None:
    compiler = manifest["compiler"]
    render.render_site({
        "css_urls": [compiler["css"]],
        "js_urls": [compiler["js"]],
        "landing_css": LANDING_CSS_MIN.read_text(encoding="utf-8"),
    })


def main() -> int:
    manifest = build_assets()
    compiler = manifest["compiler"]

    print(f"Built CSS: {compiler['css']}")
    print(f"Built JS:  {compiler['js']}")
    print("Updated:   site/static/build/asset-manifest.json")
    print()

    render_dist(manifest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"Build failed while running: {error.cmd}", file=sys.stderr)
        raise
    except Exception as error:
        print(f"Build failed: {error}", file=sys.stderr)
        raise
