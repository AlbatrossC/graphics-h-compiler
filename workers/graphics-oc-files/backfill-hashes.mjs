/**
 * backfill-hashes.mjs
 *
 * Computes SHA-256 content_hash for every file in the D1 database
 * that currently has content_hash = NULL.
 *
 * Run with:
 *   node backfill-hashes.mjs --preview      (dry-run, shows what would be updated)
 *   node backfill-hashes.mjs                (applies the updates via wrangler d1 execute)
 *
 * Requires: wrangler on PATH and you to be logged in (wrangler login)
 */

import { createHash } from 'node:crypto';
import { execSync }   from 'node:child_process';

const DB_NAME   = 'graphicsh_oc_db';
const DRY_RUN   = process.argv.includes('--preview');

function sha256(text) {
    return createHash('sha256').update(text ?? '', 'utf8').digest('hex');
}

function wranglerQuery(sql) {
    const cmd = `wrangler d1 execute ${DB_NAME} --remote --json --command="${sql.replace(/"/g, '\\"')}"`;
    const out  = execSync(cmd, { cwd: new URL('.', import.meta.url).pathname, encoding: 'utf8' });
    return JSON.parse(out);
}

console.log(`\n=== content_hash backfill (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

// 1. Fetch all files with NULL content_hash
const rows = wranglerQuery(
    'SELECT id, file_content FROM files WHERE content_hash IS NULL'
);
const files = rows?.[0]?.results ?? [];
console.log(`Files with NULL content_hash: ${files.length}`);

if (files.length === 0) {
    console.log('Nothing to do — all files already have a hash.\n');
    process.exit(0);
}

// 2. Compute + apply updates
let updated = 0;
for (const file of files) {
    const hash = sha256(file.file_content ?? '');
    const size = Buffer.byteLength(file.file_content ?? '', 'utf8');
    console.log(`  ${DRY_RUN ? '[SKIP]' : '[UPDATE]'} id=${file.id}  hash=${hash.slice(0, 12)}...  size=${size}B`);

    if (!DRY_RUN) {
        wranglerQuery(
            `UPDATE files SET content_hash = '${hash}', file_size = ${size} WHERE id = '${file.id}'`
        );
        updated++;
    }
}

console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${DRY_RUN ? files.length : updated} rows.\n`);
