import * as esbuild from 'esbuild';
import path from 'path';

esbuild.build({
    entryPoints: ['static/js/codemirror/entry.js'],
    bundle: true,
    outfile: 'static/js/compiler/codemirror.bundle.v1.js',
    format: 'esm',
    minify: true,
    treeShaking: true,
    sourcemap: false,
    target: ['es2020'],
}).then(() => {
    console.log('✅ esbuild: CodeMirror bundled successfully.');
}).catch(() => process.exit(1));
