#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const inputIndex = process.argv.indexOf('--input');
const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
if (!input) throw new Error('Usage: node scripts/validate_browser_storage_export.js --input /absolute/path/export.json');

const inputPath = path.resolve(input);
const contents = fs.readFileSync(inputPath, 'utf8');
const record = JSON.parse(contents);
assert.equal(record.schema, 'chessforge-browser-storage-export-v1', 'unexpected browser export schema');
assert.ok(typeof record.exportedAt === 'string' && Number.isFinite(Date.parse(record.exportedAt)), 'invalid exportedAt');
assert.ok(typeof record.origin === 'string' && /^https?:\/\//.test(record.origin), 'invalid origin');
assert.ok(Array.isArray(record.keys), 'keys must be an array');
assert.ok(record.values && typeof record.values === 'object' && !Array.isArray(record.values), 'values must be an object');
const declaredKeys = [...record.keys].sort();
const valueKeys = Object.keys(record.values).sort();
assert.deepEqual(declaredKeys, valueKeys, 'declared keys do not match exported values');

const criticalKeys = [
    'chess_saved_games',
    'chess_account_profiles',
    'training_player_profile',
    'training_total_xp',
    'training_current_streak',
    'training_weakness_profile',
    'chess_recent_activity',
    'chess_com_username'
];
const presentCriticalKeys = criticalKeys.filter(key => valueKeys.includes(key));
const missingCriticalKeys = criticalKeys.filter(key => !valueKeys.includes(key));

console.log(JSON.stringify({
    inputPath,
    sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    schema: record.schema,
    exportedAt: record.exportedAt,
    origin: record.origin,
    keyCount: valueKeys.length,
    presentCriticalKeys,
    missingCriticalKeys,
    valuesPrinted: false
}, null, 2));
