import assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Graphics.h Compiler extension', () => {
    test('is available to the extension host', () => {
        const extension = vscode.extensions.getExtension('AlbatrossC.graphics-h-compiler');
        assert.ok(extension);
    });
});
