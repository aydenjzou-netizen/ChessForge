(function () {
    const STORAGE_MODE_RAW = 'raw';
    const STORAGE_MODE_GZIP = 'gzip';
    const OLD_GAME_DAYS = 7;
    const COMPRESSION_VERSION = 'gzip-base64-v1';

    function getGameLabel(game) {
        return {
            id: game && game.id,
            title: game && (game.title || game.name || (game.headers && game.headers.Event) || 'Untitled Game')
        };
    }

    function stringByteLength(value) {
        return new TextEncoder().encode(String(value || '')).length;
    }

    function base64ToBytes(base64) {
        if (base64 instanceof Uint8Array) return base64;
        if (Array.isArray(base64)) return new Uint8Array(base64);

        let payload = String(base64 || '');
        if (payload.trim().startsWith('[')) {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) return new Uint8Array(parsed);
        }

        let binary;
        try {
            binary = atob(payload);
        } catch (err) {
            // Legacy experiments sometimes stored a binary string instead of base64.
            binary = payload;
        }
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    async function streamToUint8Array(stream) {
        const reader = stream.getReader();
        const chunks = [];
        let total = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.length;
        }

        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }

    async function gzipBytes(bytes) {
        if (typeof CompressionStream !== 'function') {
            throw new Error('CompressionStream is not available in this browser.');
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        return streamToUint8Array(stream);
    }

    async function gunzipBytes(bytes) {
        if (typeof DecompressionStream !== 'function') {
            throw new Error('DecompressionStream is not available in this browser.');
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return streamToUint8Array(stream);
    }

    async function compressString(input) {
        const text = String(input || '');
        const bytes = new TextEncoder().encode(text);
        const compressedBytes = await gzipBytes(bytes);
        return bytesToBase64(compressedBytes);
    }

    async function decompressString(input) {
        const compressedBytes = base64ToBytes(input);
        const bytes = await gunzipBytes(compressedBytes);
        return new TextDecoder().decode(bytes);
    }

    function parseGameTimestamp(game) {
        const candidates = [
            game && game.UTCDate,
            game && game.Date,
            game && game.EndDate,
            game && game.gameDate,
            game && game.headers && game.headers.UTCDate,
            game && game.headers && game.headers.Date,
            game && game.headers && game.headers.EndDate,
            game && game.gameMetadata && game.gameMetadata.utcDate,
            game && game.gameMetadata && game.gameMetadata.date,
            game && game.gameMetadata && game.gameMetadata.endDate,
            game && game.chessCom && game.chessCom.endTime,
            game && game.chessCom && game.chessCom.end_time,
            game && game.date
        ];

        for (const value of candidates) {
            if (!value || /[?]/.test(String(value))) continue;
            const raw = String(value);
            const normalized = /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(raw) ? raw.replace(/\./g, '-') : raw;
            const timestamp = Date.parse(normalized);
            if (Number.isFinite(timestamp)) return timestamp;
        }

        return null;
    }

    function isOldGame(game, now = Date.now()) {
        const timestamp = parseGameTimestamp(game);
        if (!timestamp) return true;
        return now - timestamp >= OLD_GAME_DAYS * 24 * 60 * 60 * 1000;
    }

    function pickLegacyCompressedField(game, field) {
        if (!game) return null;
        const direct = game.compressed && game.compressed[field];
        if (direct) return direct;
        const compressedFields = game.compressedFields && game.compressedFields[field];
        if (compressedFields) return compressedFields;

        const legacyMap = {
            pgn: ['compressedPgn', 'compressedPGN', 'compressedRawPGN', 'compressedRawPgn'],
            aiTextFormat: ['compressedAiTextFormat', 'compressedAITextFormat', 'compressedAiText', 'compressedAIText']
        };

        for (const key of legacyMap[field] || []) {
            if (game[key]) return game[key];
        }

        if ((game.storageMode === STORAGE_MODE_GZIP || game.isCompressed === true) && typeof game[field] === 'string') {
            return game[field];
        }

        return null;
    }

    function makeRawStorageGame(game, pgn, aiTextFormat) {
        const next = { ...game };
        next.storageMode = STORAGE_MODE_RAW;
        next.pgn = String(pgn || '');
        next.aiTextFormat = String(aiTextFormat || '');
        next.compressed = null;
        delete next.rawPGN;
        delete next.isCompressed;
        delete next.compressedFields;
        delete next.compressedPgn;
        delete next.compressedPGN;
        delete next.compressedRawPGN;
        delete next.compressedRawPgn;
        delete next.compressedAiTextFormat;
        delete next.compressedAITextFormat;
        delete next.compressedAiText;
        delete next.compressedAIText;
        return next;
    }

    async function hydrateGameForRuntime(game) {
        if (!game) return game;

        const { id, title } = getGameLabel(game);
        const beforePgn = game.pgn || game.rawPGN || pickLegacyCompressedField(game, 'pgn') || '';
        console.debug('[GameCompression] Hydrating game', {
            id,
            title,
            storageMode: game.storageMode || (game.isCompressed ? STORAGE_MODE_GZIP : STORAGE_MODE_RAW),
            beforePgnLength: String(beforePgn || '').length
        });

        if (game.storageMode !== STORAGE_MODE_GZIP && game.isCompressed !== true) {
            const pgn = game.pgn || game.rawPGN || '';
            const aiText = game.aiTextFormat || '';
            console.debug('[GameCompression] Hydration skipped; game is raw', {
                id,
                title,
                storageMode: game.storageMode || STORAGE_MODE_RAW,
                beforePgnLength: String(pgn || '').length,
                afterPgnLength: String(pgn || '').length,
                success: true
            });
            return {
                ...game,
                storageMode: STORAGE_MODE_RAW,
                pgn,
                rawPGN: pgn,
                aiTextFormat: aiText,
                compressed: null
            };
        }

        const plainLegacyPgn = (typeof game.pgn === 'string' && /^\s*\[/.test(game.pgn))
            ? game.pgn
            : ((typeof game.rawPGN === 'string' && /^\s*\[/.test(game.rawPGN)) ? game.rawPGN : '');
        if (plainLegacyPgn) {
            const aiText = typeof game.aiTextFormat === 'string' ? game.aiTextFormat : '';
            console.warn('[GameCompression] Gzip flag found on plain PGN; hydrating as legacy raw game', {
                id,
                title,
                storageMode: game.storageMode || STORAGE_MODE_GZIP,
                beforePgnLength: plainLegacyPgn.length,
                afterPgnLength: plainLegacyPgn.length,
                success: true
            });
            return {
                ...game,
                storageMode: STORAGE_MODE_RAW,
                pgn: plainLegacyPgn,
                rawPGN: plainLegacyPgn,
                aiTextFormat: aiText,
                compressed: null,
                hydrationError: null
            };
        }

        try {
            const compressedPgn = pickLegacyCompressedField(game, 'pgn');
            const compressedAiText = pickLegacyCompressedField(game, 'aiTextFormat');
            if (!compressedPgn) throw new Error('Missing compressed PGN payload.');

            const pgn = await decompressString(compressedPgn);
            const aiTextFormat = compressedAiText ? await decompressString(compressedAiText) : '';

            if (typeof pgn !== 'string' || !pgn.trim()) {
                throw new Error('Decompressed PGN is empty or invalid.');
            }
            if (typeof aiTextFormat !== 'string') {
                throw new Error('Decompressed AI text is invalid.');
            }

            console.debug('[GameCompression] Hydration succeeded', {
                id,
                title,
                storageMode: STORAGE_MODE_GZIP,
                compressedPgnLength: String(compressedPgn).length,
                beforePgnLength: String(compressedPgn).length,
                afterPgnLength: pgn.length,
                success: true
            });

            return {
                ...game,
                pgn,
                rawPGN: pgn,
                aiTextFormat,
                compressed: null,
                hydrationError: null
            };
        } catch (err) {
            console.error('[GameCompression] Hydration failed', {
                id,
                title,
                storageMode: game.storageMode || STORAGE_MODE_GZIP,
                beforePgnLength: String(beforePgn || '').length,
                success: false,
                error: err && err.message ? err.message : String(err)
            });
            return {
                ...game,
                pgn: '',
                rawPGN: '',
                aiTextFormat: '',
                hydrationError: err && err.message ? err.message : String(err)
            };
        }
    }

    async function compressGameForStorage(game, options = {}) {
        if (!game) return game;

        const runtimeGame = game.storageMode === STORAGE_MODE_GZIP || game.isCompressed
            ? await hydrateGameForRuntime(game)
            : { ...game, pgn: game.pgn || game.rawPGN || '', aiTextFormat: game.aiTextFormat || '' };

        if (runtimeGame.hydrationError) return { ...game };

        const pgn = runtimeGame.pgn || runtimeGame.rawPGN || '';
        const aiTextFormat = runtimeGame.aiTextFormat || '';

        return makeRawStorageGame(runtimeGame, pgn, aiTextFormat);
    }

    window.gameCompressionService = {
        STORAGE_MODE_RAW,
        STORAGE_MODE_GZIP,
        COMPRESSION_VERSION,
        compressString,
        decompressString,
        compressGameForStorage,
        hydrateGameForRuntime,
        isOldGame
    };
})();
