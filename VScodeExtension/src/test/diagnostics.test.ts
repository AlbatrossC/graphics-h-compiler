import assert from 'node:assert/strict';
import * as path from 'node:path';
import { parseCompilerOutput } from '../diagnostics';

const workingDirectory = path.resolve('workspace', 'graphics');

const diagnostics = parseCompilerOutput([
    'main.cpp:12:8: error: expected ; before } token',
    'include/helper.h:4: warning: unused variable value',
    'main.cpp:16: note: declared here',
    'collect2: error: ld returned 1 exit status'
].join('\n'), workingDirectory);

assert.equal(diagnostics.length, 4);
assert.deepEqual(diagnostics[0], {
    file: path.join(workingDirectory, 'main.cpp'),
    line: 12,
    column: 8,
    severity: 'error',
    message: 'expected ; before } token'
});
assert.equal(diagnostics[1].file, path.join(workingDirectory, 'include', 'helper.h'));
assert.equal(diagnostics[1].severity, 'warning');
assert.equal(diagnostics[2].severity, 'information');
assert.equal(diagnostics[3].file, undefined);
assert.equal(diagnostics[3].severity, 'error');

console.log('diagnostics tests passed');
