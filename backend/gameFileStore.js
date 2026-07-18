const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const STORAGE_MODE_RAW = 'raw';
const STORAGE_MODE_GZIP = 'gzip';
const COMPRESSION_VERSION = 'node-gzip-file-v1';
const ARCHIVE_AGE_DAYS = 7;
const ARCHIVE_AGE_MS = ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000;
const PGN_RAW_FILE = 'original.pgn';
const PGN_GZIP_FILE = 'original.pgn.gz';
const AI_RAW_FILE = 'ai-format.txt';
const AI_GZIP_FILE = 'ai-format.txt.gz';
const METADATA_GZIP_FILE = 'metadata.full.json.gz';
const LIBRARY_GAME_LIMIT = 750;

function gameFolder(storageDir, id) {
    return path.join(storageDir, String(id));
}

function safeGameId(game) {
    return String(game.id || uuidv4()).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeKeyPart(value) {
    return String(value || '').trim().toLowerCase();
}

function gameIdentityKeys(game) {
    if (!game) return [];
    const keys = new Set();
    const headers = game.headers || {};
    const chessCom = game.chessCom || {};
    const gameMetadata = game.gameMetadata || {};
    const pgn = game.pgn || game.rawPGN || '';
    const date = normalizeKeyPart(
        pgnHeaderValue(pgn, 'UTCDate') ||
        pgnHeaderValue(pgn, 'Date') ||
        headers.UTCDate ||
        headers.Date ||
        game.UTCDate ||
        game.Date ||
        game.gameDate ||
        gameMetadata.date
    );
    const white = normalizeKeyPart(headers.White || game.white);
    const black = normalizeKeyPart(headers.Black || game.black);
    const result = normalizeKeyPart(headers.Result || game.result);

    if (game.id) keys.add(`id:${normalizeKeyPart(game.id)}`);
    if (chessCom.uuid) keys.add(`cc-uuid:${normalizeKeyPart(chessCom.uuid)}`);
    if (gameMetadata.uuid) keys.add(`cc-uuid:${normalizeKeyPart(gameMetadata.uuid)}`);
    if (chessCom.url) keys.add(`cc-url:${normalizeKeyPart(chessCom.url)}`);
    if (gameMetadata.url) keys.add(`cc-url:${normalizeKeyPart(gameMetadata.url)}`);
    if (date && white && black) keys.add(`players:${date}:${white}:${black}:${result}`);

    return Array.from(keys);
}

function publicMetadata(game, id) {
    const metadata = { ...game };
    delete metadata.pgn;
    delete metadata.rawPGN;
    delete metadata.aiTextFormat;
    delete metadata.aiText;
    metadata.id = id;
    metadata.pgn = null;
    metadata.aiTextFormat = null;
    return metadata;
}

function normalizeApiGame(metadata, pgn, aiTextFormat) {
    return {
        ...metadata,
        id: metadata.id,
        storageMode: metadata.isMetadataOnly ? 'metadata-only' : STORAGE_MODE_RAW,
        pgn,
        rawPGN: pgn,
        aiTextFormat,
        compressed: null,
        compression: metadata.compression || null
    };
}

function normalizeDateString(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.includes('?')) return '';
    if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(raw)) return raw.replace(/\./g, '-');
    if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return raw;
}

function pgnHeaderValue(pgn, headerName) {
    const pattern = new RegExp(`^\\[${headerName}\\s+"([^"]+)"\\]`, 'im');
    const match = pattern.exec(String(pgn || ''));
    return match ? match[1] : null;
}

function parseTimestampValue(value) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 10_000_000_000 ? value : value * 1000;
    }

    const raw = String(value).trim();
    if (!raw || raw === '?' || /^[-./?]+$/.test(raw)) return null;

    if (/^\d{10,13}$/.test(raw)) {
        const numeric = Number(raw);
        return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    }

    const chessDate = /^(\d{4})[.\-/](\d{1,2}|\?\?)[.\-/](\d{1,2}|\?\?)$/.exec(raw);
    if (chessDate) {
        const year = Number(chessDate[1]);
        const month = chessDate[2] === '??' ? 1 : Number(chessDate[2]);
        const day = chessDate[3] === '??' ? 1 : Number(chessDate[3]);
        const timestamp = Date.UTC(year, month - 1, day);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    const timestamp = Date.parse(normalizeDateString(raw));
    return Number.isFinite(timestamp) ? timestamp : null;
}

function parseTimestampCandidates(candidates) {
    for (const value of candidates.flat()) {
        const timestamp = parseTimestampValue(value);
        if (timestamp !== null) return timestamp;
    }

    return null;
}

function parseGameTimestamp(game) {
    const pgn = game && (game.pgn || game.rawPGN || '');
    return parseTimestampCandidates([
        pgnHeaderValue(pgn, 'UTCDate'),
        pgnHeaderValue(pgn, 'Date'),
        pgnHeaderValue(pgn, 'EndDate'),
        game && game.headers && game.headers.UTCDate,
        game && game.headers && game.headers.Date,
        game && game.headers && game.headers.EndDate,
        game && game.UTCDate,
        game && game.Date,
        game && game.EndDate,
        game && game.gameDate,
        game && game.gameMetadata && game.gameMetadata.utcDate,
        game && game.gameMetadata && game.gameMetadata.date,
        game && game.gameMetadata && game.gameMetadata.endDate,
        game && game.chessCom && game.chessCom.endTime,
        game && game.chessCom && game.chessCom.end_time,
        game && game.date
    ]);
}

function shouldArchiveGame(game, now = Date.now()) {
    const timestamp = parseGameTimestamp(game);
    if (timestamp === null) return true;
    return now - timestamp >= ARCHIVE_AGE_MS;
}

function rawMetadata(game, id) {
    const metadata = publicMetadata(game, id);
    metadata.storageMode = STORAGE_MODE_RAW;
    metadata.files = {
        pgn: PGN_RAW_FILE,
        aiTextFormat: AI_RAW_FILE
    };
    metadata.compressed = null;
    metadata.compression = null;
    delete metadata.compressionVersion;
    delete metadata.compressedAt;
    return metadata;
}

function metadataOnlyRecord(game, id) {
    const metadata = publicMetadata(game, id);
    metadata.storageMode = 'metadata-only';
    metadata.isMetadataOnly = true;
    metadata.files = {};
    metadata.compressed = null;
    metadata.compression = null;
    metadata.pgn = null;
    metadata.rawPGN = null;
    metadata.aiTextFormat = null;
    delete metadata.compressionVersion;
    delete metadata.compressedAt;
    return metadata;
}

function compressedMetadata(game, id, pgnBytes, aiTextBytes) {
    const metadata = publicMetadata(game, id);
    metadata.storageMode = STORAGE_MODE_GZIP;
    metadata.compressed = {
        pgn: PGN_GZIP_FILE,
        aiTextFormat: AI_GZIP_FILE
    };
    metadata.compression = {
        method: STORAGE_MODE_GZIP,
        version: COMPRESSION_VERSION,
        encoding: 'utf8',
        files: {
            pgn: PGN_GZIP_FILE,
            aiTextFormat: AI_GZIP_FILE,
            metadata: METADATA_GZIP_FILE
        },
        originalBytes: {
            pgn: pgnBytes,
            aiTextFormat: aiTextBytes,
            metadata: 0
        }
    };
    metadata.compressionVersion = COMPRESSION_VERSION;
    metadata.compressedAt = new Date().toISOString();
    return metadata;
}

function archiveManifest(metadata, metadataBytes) {
    const manifest = {
        id: metadata.id,
        title: metadata.title || metadata.name || metadata.Event || 'Untitled Game',
        name: metadata.name || metadata.title || metadata.Event || 'Untitled Game',
        storageMode: STORAGE_MODE_GZIP,
        compressed: {
            ...metadata.compressed,
            metadata: METADATA_GZIP_FILE
        },
        compression: {
            ...metadata.compression,
            originalBytes: {
                ...metadata.compression.originalBytes,
                metadata: metadataBytes
            }
        },
        compressionVersion: COMPRESSION_VERSION,
        compressedAt: metadata.compressedAt
    };

    if (metadata.Date) manifest.Date = metadata.Date;
    if (metadata.UTCDate) manifest.UTCDate = metadata.UTCDate;
    if (metadata.headers) {
        manifest.headers = {
            Event: metadata.headers.Event,
            Site: metadata.headers.Site,
            Date: metadata.headers.Date,
            UTCDate: metadata.headers.UTCDate,
            White: metadata.headers.White,
            Black: metadata.headers.Black,
            Result: metadata.headers.Result
        };
    }
    if (metadata.moveCount !== undefined) manifest.moveCount = metadata.moveCount;
    if (metadata.result !== undefined) manifest.result = metadata.result;
    if (metadata.source !== undefined) manifest.source = metadata.source;

    return manifest;
}

async function readTextOrGzip(folder, rawName, gzipName) {
    const gzipPath = path.join(folder, gzipName);
    if (await fs.pathExists(gzipPath)) {
        try {
            return (await gunzip(await fs.readFile(gzipPath))).toString('utf8');
        } catch (err) {
            throw new Error(`Failed to decompress ${gzipName}: ${err.message}`);
        }
    }

    const rawPath = path.join(folder, rawName);
    if (await fs.pathExists(rawPath)) {
        return fs.readFile(rawPath, 'utf8');
    }

    return '';
}

async function writeCompressedGame(folder, metadata, pgn, aiTextFormat) {
    const pgnBytes = Buffer.from(pgn, 'utf8');
    const aiTextBytes = Buffer.from(aiTextFormat, 'utf8');
    const metadataText = JSON.stringify(metadata, null, 2);
    const metadataBytes = Buffer.from(metadataText, 'utf8');
    const pgnGzip = await gzip(pgnBytes);
    const aiGzip = await gzip(aiTextBytes);
    const metadataGzip = await gzip(metadataBytes);

    const pgnRoundTrip = (await gunzip(pgnGzip)).toString('utf8');
    const aiRoundTrip = (await gunzip(aiGzip)).toString('utf8');
    const metadataRoundTrip = (await gunzip(metadataGzip)).toString('utf8');
    if (pgnRoundTrip !== pgn || aiRoundTrip !== aiTextFormat || metadataRoundTrip !== metadataText) {
        throw new Error('Compression round-trip check failed.');
    }

    await fs.writeFile(path.join(folder, PGN_GZIP_FILE), pgnGzip);
    await fs.writeFile(path.join(folder, AI_GZIP_FILE), aiGzip);
    await fs.writeFile(path.join(folder, METADATA_GZIP_FILE), metadataGzip);
    await fs.writeJson(path.join(folder, 'metadata.json'), archiveManifest(metadata, metadataBytes.length), { spaces: 2 });
    await fs.remove(path.join(folder, PGN_RAW_FILE));
    await fs.remove(path.join(folder, AI_RAW_FILE));

    return { pgnGzipBytes: pgnGzip.length, aiGzipBytes: aiGzip.length, metadataGzipBytes: metadataGzip.length };
}

async function writeRawGame(folder, metadata, pgn, aiTextFormat) {
    await fs.writeFile(path.join(folder, PGN_RAW_FILE), pgn, 'utf8');
    await fs.writeFile(path.join(folder, AI_RAW_FILE), aiTextFormat, 'utf8');
    await fs.writeJson(path.join(folder, 'metadata.json'), metadata, { spaces: 2 });
    await fs.remove(path.join(folder, PGN_GZIP_FILE));
    await fs.remove(path.join(folder, AI_GZIP_FILE));
    await fs.remove(path.join(folder, METADATA_GZIP_FILE));
}

async function saveMetadataOnlyGame(storageDir, game) {
    const id = safeGameId(game);
    const folder = gameFolder(storageDir, id);
    await fs.ensureDir(folder);

    const metadata = metadataOnlyRecord(game, id);
    await fs.writeJson(path.join(folder, 'metadata.json'), metadata, { spaces: 2 });
    await fs.remove(path.join(folder, PGN_RAW_FILE));
    await fs.remove(path.join(folder, AI_RAW_FILE));
    await fs.remove(path.join(folder, PGN_GZIP_FILE));
    await fs.remove(path.join(folder, AI_GZIP_FILE));
    await fs.remove(path.join(folder, METADATA_GZIP_FILE));

    return normalizeApiGame(metadata, '', '');
}

async function saveGame(storageDir, game, options = {}) {
    const id = safeGameId(game);
    const folder = gameFolder(storageDir, id);
    await fs.ensureDir(folder);

    const pgn = String(game.pgn || game.rawPGN || '');
    const aiTextFormat = String(game.aiTextFormat || game.aiText || '');
    if (!pgn.trim()) {
        throw new Error(`Cannot save game ${id}: PGN is empty.`);
    }

    const pgnBytes = Buffer.byteLength(pgn, 'utf8');
    const aiTextBytes = Buffer.byteLength(aiTextFormat, 'utf8');
    const archive = options.forceArchive === true || (options.forceRaw !== true && shouldArchiveGame(game, options.now));
    const metadata = archive
        ? compressedMetadata(game, id, pgnBytes, aiTextBytes)
        : rawMetadata(game, id);

    if (archive) {
        const stats = await writeCompressedGame(folder, metadata, pgn, aiTextFormat);
        console.log('[FileGameStore] Saved archived game', {
            id,
            title: metadata.title || metadata.name || metadata.Event,
            pgnBytes,
            pgnGzipBytes: stats.pgnGzipBytes,
            aiTextBytes,
            aiTextGzipBytes: stats.aiGzipBytes,
            metadataGzipBytes: stats.metadataGzipBytes,
            folder
        });
    } else {
        await writeRawGame(folder, metadata, pgn, aiTextFormat);
        console.log('[FileGameStore] Saved raw game', {
            id,
            title: metadata.title || metadata.name || metadata.Event,
            pgnBytes,
            aiTextBytes,
            folder
        });
    }

    return normalizeApiGame(metadata, pgn, aiTextFormat);
}

async function saveCompressedGame(storageDir, game) {
    return saveGame(storageDir, game, { forceArchive: true });
}

async function saveGameRecord(storageDir, game) {
    if (game && (game.pgn || game.rawPGN)) return saveGame(storageDir, game);
    if (game && game.isMetadataOnly) return saveMetadataOnlyGame(storageDir, game);
    return null;
}

async function readGame(storageDir, id) {
    const folder = gameFolder(storageDir, id);
    if (!(await fs.pathExists(folder))) return null;

    const metadataPath = path.join(folder, 'metadata.json');
    const compressedMetadataPath = path.join(folder, METADATA_GZIP_FILE);
    const hasMetadata = await fs.pathExists(metadataPath);
    const hasCompressedMetadata = await fs.pathExists(compressedMetadataPath);
    if (!hasMetadata && !hasCompressedMetadata) return null;

    let metadata;
    if (hasCompressedMetadata) {
        try {
            metadata = JSON.parse((await gunzip(await fs.readFile(compressedMetadataPath))).toString('utf8'));
        } catch (err) {
            if (err && err.code === 'ENOENT') return null;
            throw new Error(`Failed to decompress ${METADATA_GZIP_FILE}: ${err.message}`);
        }
    } else {
        try {
            metadata = await fs.readJson(metadataPath);
        } catch (err) {
            if (err && err.code === 'ENOENT') return null;
            throw err;
        }
    }
    metadata.id = metadata.id || id;

    const pgn = await readTextOrGzip(folder, PGN_RAW_FILE, PGN_GZIP_FILE);
    const aiTextFormat = await readTextOrGzip(folder, AI_RAW_FILE, AI_GZIP_FILE);
    return normalizeApiGame(metadata, pgn, aiTextFormat);
}

async function gameStorageNeedsRewrite(folder, game) {
    if (game && game.isMetadataOnly && !(game.pgn || game.rawPGN)) return false;

    const hasRawPgn = await fs.pathExists(path.join(folder, PGN_RAW_FILE));
    const hasRawAi = await fs.pathExists(path.join(folder, AI_RAW_FILE));
    const hasGzipPgn = await fs.pathExists(path.join(folder, PGN_GZIP_FILE));
    const hasGzipAi = await fs.pathExists(path.join(folder, AI_GZIP_FILE));
    const hasGzipMetadata = await fs.pathExists(path.join(folder, METADATA_GZIP_FILE));
    const shouldArchive = shouldArchiveGame(game);

    return shouldArchive
        ? (hasRawPgn || hasRawAi || !hasGzipPgn || !hasGzipMetadata)
        : (hasGzipPgn || hasGzipAi || hasGzipMetadata || !hasRawPgn);
}

async function listGames(storageDir, options = {}) {
    await fs.ensureDir(storageDir);
    const entries = await fs.readdir(storageDir);
    const games = [];

    for (const id of entries) {
        const folder = gameFolder(storageDir, id);
        try {
            const stats = await fs.stat(folder);
            if (!stats.isDirectory()) continue;
            let game = await readGame(storageDir, id);
            if (game && options.reconcile !== false && await gameStorageNeedsRewrite(folder, game)) {
                game = await saveGame(storageDir, game);
            }
            if (game) games.push(game);
        } catch (err) {
            if (err && err.code === 'ENOENT') continue;
            console.warn('[FileGameStore] Skipping unreadable game folder:', id, err.message);
        }
    }

    return games;
}

async function replaceLibrary(storageDir, games) {
    await fs.ensureDir(storageDir);
    const nextGames = (Array.isArray(games) ? games : []).slice(0, LIBRARY_GAME_LIMIT);
    const existingGames = await listGames(storageDir, { reconcile: false });
    const existingFullByKey = new Map();
    for (const existingGame of existingGames) {
        if (!existingGame || existingGame.isMetadataOnly || !(existingGame.pgn || existingGame.rawPGN)) continue;
        for (const key of gameIdentityKeys(existingGame)) {
            existingFullByKey.set(key, existingGame);
        }
    }

    const saved = [];
    const keepIds = new Set();
    const tempStorageDir = path.join(
        path.dirname(storageDir),
        `${path.basename(storageDir)}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    await fs.ensureDir(tempStorageDir);

    try {
        for (const inputGame of nextGames) {
            let game = inputGame;
            if (!game) continue;
            if (game.isMetadataOnly && !(game.pgn || game.rawPGN)) {
                const existingFullGame = gameIdentityKeys(game)
                    .map(key => existingFullByKey.get(key))
                    .find(Boolean);
                if (existingFullGame) {
                    game = existingFullGame;
                }
            }

            const savedGame = await saveGameRecord(tempStorageDir, game);
            if (!savedGame) continue;
            keepIds.add(savedGame.id);
            saved.push(savedGame);
        }

        const stagedEntries = await fs.readdir(tempStorageDir);
        for (const id of stagedEntries) {
            const stagedFolder = path.join(tempStorageDir, id);
            const stats = await fs.stat(stagedFolder);
            if (!stats.isDirectory()) continue;
            await fs.move(stagedFolder, gameFolder(storageDir, id), { overwrite: true });
        }

        const entries = await fs.readdir(storageDir);
        for (const id of entries) {
            if (id === 'skill-profile.json' || id === '.DS_Store') continue;
            const folder = gameFolder(storageDir, id);
            try {
                const stats = await fs.stat(folder);
                if (stats.isDirectory() && !keepIds.has(id)) {
                    await fs.remove(folder);
                }
            } catch (err) {
                if (!err || err.code !== 'ENOENT') throw err;
            }
        }
    } catch (err) {
        await fs.remove(tempStorageDir);
        throw err;
    } finally {
        await fs.remove(tempStorageDir);
    }

    return saved;
}

async function migrateExistingRawFiles(storageDir) {
    const games = await listGames(storageDir, { reconcile: false });
    let migrated = 0;
    for (const game of games) {
        const folder = gameFolder(storageDir, game.id);
        if (await gameStorageNeedsRewrite(folder, game)) {
            await saveGame(storageDir, game);
            migrated++;
        }
    }
    return migrated;
}

module.exports = {
    STORAGE_MODE_RAW,
    STORAGE_MODE_GZIP,
    COMPRESSION_VERSION,
    ARCHIVE_AGE_DAYS,
    LIBRARY_GAME_LIMIT,
    shouldArchiveGame,
    saveGame,
    saveMetadataOnlyGame,
    saveCompressedGame,
    saveGameRecord,
    readGame,
    listGames,
    replaceLibrary,
    migrateExistingRawFiles
};
