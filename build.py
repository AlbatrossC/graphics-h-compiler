from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

from rcssmin import cssmin
from rjsmin import jsmin


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
BUILD_DIR = STATIC_DIR / "build"
CSS_DIR = STATIC_DIR / "css" / "compiler"
JS_DIR = STATIC_DIR / "js" / "compiler"
CODEMIRROR_BUILD_DIR = ROOT / "build-tools" / "codemirror"

CSS_PRIORITY = [
    "base.css",
    "panels.css",
    "sidebar.css",
    "preferences.css",
    "responsive.css",
    "toasts.css",
]

JS_PRIORITY = [
    "asset-sources.js",
    "app.js",
    "files-ui.js",
    "files.js",
    "autocomplete.js",
    "editor.js",
    "shell.js",
    "execution.js",
    "preferences.js",
    "ai-fix.js",
]

EXCLUDED_JS = {
    "analytics.js",
    "codemirror.bundle.v1.js",
    "js-dos-loader.js",
    "dosbox.js",
    "dosbox.wasm",
}


def ordered_files(directory: Path, priority: list[str], suffix: str, excluded: set[str] | None = None) -> list[Path]:
    excluded = excluded or set()
    available = {path.name: path for path in directory.glob(f"*{suffix}") if path.name not in excluded}
    ordered = [available.pop(name) for name in priority if name in available]
    ordered.extend(sorted(available.values(), key=lambda path: path.name))
    return ordered


def bundle_text(files: list[Path], minifier, comment_style: str) -> str:
    raw_chunks = []
    for file_path in files:
        relative_path = file_path.relative_to(ROOT).as_posix()
        if comment_style == "css":
            raw_chunks.append(f"/* Source: {relative_path} */\n")
        else:
            raw_chunks.append(f"// Source: {relative_path}\n")
        raw_chunks.append(file_path.read_text(encoding="utf-8").strip())
        raw_chunks.append("\n" if comment_style == "css" else "\n;\n")
    return minifier("\n".join(raw_chunks))


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def write_hashed_asset(prefix: str, extension: str, content: str) -> str:
    hashed_name = f"{prefix}.{content_hash(content)}.{extension}"
    output_path = BUILD_DIR / hashed_name
    output_path.write_text(content, encoding="utf-8", newline="\n")
    return f"/static/build/{hashed_name}"


def clean_old_build_outputs() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    for path in BUILD_DIR.glob("compiler.*.css"):
        path.unlink()
    for path in BUILD_DIR.glob("compiler.*.js"):
        path.unlink()


def resolve_node_command() -> list[str]:
    node_path = shutil.which("node")
    if node_path:
        return [node_path]
    raise RuntimeError("Node.js is required to rebuild codemirror.bundle.v1.js during the asset build.")


def build_codemirror_bundle() -> None:
    entry_path = (CODEMIRROR_BUILD_DIR / "entry.js").as_posix()
    outfile_path = (JS_DIR / "codemirror.bundle.v1.js").as_posix()
    build_script = "\n".join([
        "const esbuild = require('esbuild');",
        "esbuild.buildSync({",
        f"  entryPoints: ['{entry_path}'],",
        "  bundle: true,",
        f"  outfile: '{outfile_path}',",
        "  format: 'esm',",
        "  minify: true,",
        "  treeShaking: true,",
        "  sourcemap: false,",
        "  target: ['es2020'],",
        "});",
        "console.log('CodeMirror bundle rebuilt.');",
    ])
    command = resolve_node_command() + ["-e", build_script]
    subprocess.run(command, cwd=ROOT, check=True)


def build_compiler_assets() -> dict[str, object]:
    clean_old_build_outputs()
    build_codemirror_bundle()

    css_files = ordered_files(CSS_DIR, CSS_PRIORITY, ".css")
    js_files = ordered_files(JS_DIR, JS_PRIORITY, ".js", EXCLUDED_JS)

    css_bundle = bundle_text(css_files, cssmin, "css")
    js_bundle = bundle_text(js_files, jsmin, "js")

    css_url = write_hashed_asset("compiler", "css", css_bundle)
    js_url = write_hashed_asset("compiler", "js", js_bundle)

    manifest = {
        "compiler": {
            "css": css_url,
            "js": js_url,
            "css_sources": [path.relative_to(ROOT).as_posix() for path in css_files],
            "js_sources": [path.relative_to(ROOT).as_posix() for path in js_files],
        },
        "separate": {
            "codemirror_bundle": "/static/js/compiler/codemirror.bundle.v1.js",
            "lazy_loaded": [
                "/static/js/compiler/codemirror.bundle.v1.js",
                "/libs/js-dos.js",
                "/libs/wdosbox.js",
                "/libs/wdosbox.wasm",
                "/static/analytics.js",
            ],
        },
    }

    (BUILD_DIR / "asset-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest


def main() -> int:
    manifest = build_compiler_assets()
    compiler = manifest["compiler"]
    print(f"Built CSS: {compiler['css']}")
    print(f"Built JS:  {compiler['js']}")
    print("Updated:   /static/build/asset-manifest.json")
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
