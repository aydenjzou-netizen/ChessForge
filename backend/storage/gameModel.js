const { v4: uuidv4 } = require('uuid');

const VALID_RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function first(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

function isoDate(value) {
    if (!value) return null;
    if (typeof value === 'number') {
        const millis = value > 10_000_000_000 ? value : value * 1000;
        return new Date(millis).toISOString();
    }
    const normalized = String(value).replace(/\./g, '-');
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function canonicalGame(input = {}) {
    const headers = input.headers || {};
    const chessCom = input.chessCom || {};
    const legacy = input.gameMetadata || {};
    const source = first(input.source, legacy.source, chessCom.uuid ? 'chess.com' : 'manual');
    const pgn = first(input.pgn, input.rawPGN, null);
    const result = first(input.result, headers.Result, legacy.result, '*');
    const externalGameId = first(input.externalGameId, chessCom.uuid, legacy.uuid, null);
    const externalUrl = first(input.externalUrl, chessCom.url, legacy.url, headers.Site, null);
    const playedAt = isoDate(first(input.playedAt, chessCom.endTime, legacy.endTime, input.gameDate, input.Date, headers.Date));
    const title = first(input.title, input.name, headers.Event, `${headers.White || 'Unknown'} vs ${headers.Black || 'Unknown'}`);
    const importState = pgn ? 'complete' : 'metadata_only';

    return {
        id: String(input.id || uuidv4()),
        title: String(title),
        source: String(source),
        externalGameId: externalGameId ? String(externalGameId) : null,
        externalUrl: externalUrl ? String(externalUrl) : null,
        eventName: first(input.eventName, headers.Event, null),
        site: first(input.site, headers.Site, null),
        whitePlayer: String(first(input.whitePlayer, headers.White, input.white, 'Unknown')),
        blackPlayer: String(first(input.blackPlayer, headers.Black, input.black, 'Unknown')),
        userColor: first(input.userColor, chessCom.userColor, legacy.userColor, null),
        result: VALID_RESULTS.has(result) ? result : '*',
        playedAt,
        timeClass: first(input.timeClass, chessCom.timeClass, null),
        rules: first(input.rules, chessCom.rules, 'chess'),
        moveCount: Number.isFinite(Number(input.moveCount)) ? Number(input.moveCount) : null,
        pgn: pgn === null ? null : String(pgn),
        aiText: first(input.aiText, input.aiTextFormat, null),
        importState,
        createdAt: isoDate(input.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
            archiveUrl: first(chessCom.archiveUrl, legacy.archiveUrl, null),
            providerUsername: first(chessCom.username, legacy.username, null),
            original: input.metadata && input.metadata.original ? input.metadata.original : input
        }
    };
}

function apiGame(game) {
    if (!game) return null;
    const headers = {
        Event: game.eventName || game.title,
        Site: game.site || game.externalUrl,
        Date: game.playedAt ? game.playedAt.slice(0, 10).replace(/-/g, '.') : null,
        White: game.whitePlayer,
        Black: game.blackPlayer,
        Result: game.result
    };
    return {
        ...game,
        name: game.title,
        headers,
        pgn: game.pgn,
        rawPGN: game.pgn,
        aiTextFormat: game.aiText,
        isMetadataOnly: game.importState === 'metadata_only',
        storageMode: game.importState === 'metadata_only' ? 'metadata-only' : 'database-ready',
        chessCom: game.source === 'chess.com' ? {
            uuid: game.externalGameId,
            url: game.externalUrl,
            userColor: game.userColor,
            timeClass: game.timeClass,
            rules: game.rules,
            username: game.metadata && game.metadata.providerUsername,
            archiveUrl: game.metadata && game.metadata.archiveUrl
        } : undefined
    };
}

module.exports = { canonicalGame, apiGame };
