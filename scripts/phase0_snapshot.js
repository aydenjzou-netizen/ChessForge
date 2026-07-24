#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputRoot = path.join(repositoryRoot, 'scratch', 'phase0-snapshots', timestamp);
const copiedDataRoot = path.join(outputRoot, 'data');
const browserArgumentIndex = process.argv.indexOf('--browser-export');
const browserExport = browserArgumentIndex >= 0 ? process.argv[browserArgumentIndex + 1] : null;
const defaultUserId = process.env.LOCAL_USER_ID || '00000000-0000-4000-8000-000000000001';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sources = [
    { relativePath: 'backend/game-storage', category: 'legacy-game-and-training-data', copy: true },
    { relativePath: 'backend/app-data', category: 'user-scoped-local-adapter-data', copy: true },
    { relativePath: 'data/puzzles/lichess_db_puzzle.csv', category: 'large-puzzle-dataset', copy: false },
    { relativePath: 'coach_vector_store.json', category: 'derived-coach-vector-store', copy: false }
];

function collectFiles(target) {
    if (!fs.existsSync(target)) return [];
    const stats = fs.statSync(target);
    if (stats.isFile()) return [target];
    return fs.readdirSync(target, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap(entry => collectFiles(path.join(target, entry.name)));
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

function csvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

fs.mkdirSync(copiedDataRoot, { recursive: true });

const manifest = [];
for (const source of sources) {
    const absoluteSource = path.join(repositoryRoot, source.relativePath);
    if (!fs.existsSync(absoluteSource)) continue;
    if (source.copy) {
        const destination = path.join(copiedDataRoot, source.relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(absoluteSource, destination, { recursive: true, preserveTimestamps: true });
    }
    for (const filePath of collectFiles(absoluteSource)) {
        const relativePath = path.relative(repositoryRoot, filePath);
        const stats = fs.statSync(filePath);
        manifest.push({
            relativePath,
            category: source.category,
            bytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            sha256: sha256(filePath),
            copiedIntoSnapshot: source.copy
        });
    }
}

if (browserExport) {
    const absoluteBrowserExport = path.resolve(browserExport);
    if (!fs.existsSync(absoluteBrowserExport) || !fs.statSync(absoluteBrowserExport).isFile()) {
        throw new Error(`Browser export not found: ${absoluteBrowserExport}`);
    }
    const destination = path.join(copiedDataRoot, 'browser', path.basename(absoluteBrowserExport));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(absoluteBrowserExport, destination);
    const stats = fs.statSync(absoluteBrowserExport);
    manifest.push({
        relativePath: path.relative(repositoryRoot, absoluteBrowserExport),
        category: 'browser-local-storage-export',
        bytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        sha256: sha256(absoluteBrowserExport),
        copiedIntoSnapshot: true
    });
}

manifest.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(
    path.join(outputRoot, 'sha256sums.txt'),
    `${manifest.map(entry => `${entry.sha256}  ${entry.relativePath}`).join('\n')}\n`
);

const gameMetadataFiles = manifest.filter(entry => /^backend\/game-storage\/[^/]+\/metadata\.json$/.test(entry.relativePath));
const idRows = [['source_folder', 'legacy_id', 'target_user_id', 'target_game_id', 'mapping_status']];
let invalidMetadata = 0;
for (const entry of gameMetadataFiles) {
    const metadataPath = path.join(repositoryRoot, entry.relativePath);
    const sourceFolder = path.basename(path.dirname(metadataPath));
    try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const legacyId = String(metadata.id || sourceFolder);
        const validIdentityMapping = UUID_PATTERN.test(legacyId);
        idRows.push([
            sourceFolder,
            legacyId,
            defaultUserId,
            validIdentityMapping ? legacyId : '',
            validIdentityMapping ? 'identity-mapping' : 'requires-stable-id-decision'
        ]);
        if (!validIdentityMapping) invalidMetadata += 1;
    } catch (error) {
        idRows.push([sourceFolder, '', defaultUserId, '', `invalid-json:${error.message}`]);
        invalidMetadata += 1;
    }
}
fs.writeFileSync(
    path.join(outputRoot, 'legacy-id-map.csv'),
    `${idRows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
);

const summary = {
    createdAt: new Date().toISOString(),
    repositoryRoot,
    gitHead: process.env.PHASE0_GIT_HEAD || null,
    defaultMigrationUserId: defaultUserId,
    browserExportIncluded: Boolean(browserExport),
    fileCount: manifest.length,
    totalBytesInventoried: manifest.reduce((total, entry) => total + entry.bytes, 0),
    bytesCopiedIntoSnapshot: manifest.filter(entry => entry.copiedIntoSnapshot).reduce((total, entry) => total + entry.bytes, 0),
    legacyGameMetadataRecords: gameMetadataFiles.length,
    legacyGameMetadataNeedingIdDecision: invalidMetadata,
    categories: Object.fromEntries(
        [...new Set(manifest.map(entry => entry.category))].sort().map(category => [
            category,
            {
                files: manifest.filter(entry => entry.category === category).length,
                bytes: manifest.filter(entry => entry.category === category).reduce((total, entry) => total + entry.bytes, 0)
            }
        ])
    )
};
fs.writeFileSync(path.join(outputRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify({ outputRoot, ...summary }, null, 2));
