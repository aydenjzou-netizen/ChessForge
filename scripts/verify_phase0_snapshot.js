#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const snapshotsRoot = path.join(repositoryRoot, 'scratch', 'phase0-snapshots');
const snapshotFlagIndex = process.argv.indexOf('--snapshot');
const explicitSnapshot = snapshotFlagIndex >= 0 ? process.argv[snapshotFlagIndex + 1] : null;

function latestSnapshot() {
    if (!fs.existsSync(snapshotsRoot)) throw new Error(`Snapshot directory does not exist: ${snapshotsRoot}`);
    const names = fs.readdirSync(snapshotsRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    if (!names.length) throw new Error(`No Phase 0 snapshots found under ${snapshotsRoot}`);
    return path.join(snapshotsRoot, names.at(-1));
}

function sha256(filePath) {
    const hash = crypto.createHash('sha256');
    const descriptor = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        let bytesRead;
        while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        fs.closeSync(descriptor);
    }
    return hash.digest('hex');
}

const snapshotRoot = explicitSnapshot ? path.resolve(explicitSnapshot) : latestSnapshot();
const manifestPath = path.join(snapshotRoot, 'manifest.json');
const summaryPath = path.join(snapshotRoot, 'summary.json');
const idMapPath = path.join(snapshotRoot, 'legacy-id-map.csv');
for (const required of [manifestPath, summaryPath, idMapPath]) {
    assert.ok(fs.existsSync(required), `required snapshot file missing: ${required}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
let copiedFiles = 0;
for (const entry of manifest) {
    const source = path.join(repositoryRoot, entry.relativePath);
    assert.ok(fs.existsSync(source), `source missing: ${entry.relativePath}`);
    assert.equal(sha256(source), entry.sha256, `source hash mismatch: ${entry.relativePath}`);
    if (entry.copiedIntoSnapshot) {
        const copy = path.join(snapshotRoot, 'data', entry.relativePath);
        assert.ok(fs.existsSync(copy), `snapshot copy missing: ${entry.relativePath}`);
        assert.equal(sha256(copy), entry.sha256, `snapshot copy hash mismatch: ${entry.relativePath}`);
        copiedFiles += 1;
    }
}

const metadataEntries = manifest.filter(entry => /^backend\/game-storage\/[^/]+\/metadata\.json$/.test(entry.relativePath));
for (const entry of metadataEntries) {
    JSON.parse(fs.readFileSync(path.join(repositoryRoot, entry.relativePath), 'utf8'));
}
const idMapRows = fs.readFileSync(idMapPath, 'utf8').trim().split('\n').length - 1;
assert.equal(idMapRows, metadataEntries.length, 'legacy ID-map row count does not match game metadata count');
assert.equal(summary.fileCount, manifest.length, 'summary file count does not match manifest');
assert.equal(summary.legacyGameMetadataRecords, metadataEntries.length, 'summary metadata count does not match manifest');
assert.equal(summary.legacyGameMetadataNeedingIdDecision, 0, 'one or more legacy IDs still need a mapping decision');

console.log(JSON.stringify({
    snapshotRoot,
    sourceHashesVerified: manifest.length,
    copiedHashesVerified: copiedFiles,
    metadataJsonParsed: metadataEntries.length,
    idMapRows,
    browserExportIncluded: summary.browserExportIncluded
}, null, 2));
