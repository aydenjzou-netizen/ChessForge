/**
 * Shared AI chess text format helpers (chess.js). Keeps Node exports aligned with static/app.js.
 */
const { Chess } = require('chess.js');

function removeFenLines(text) {
    if (!text) return '';
    return text.replace(/\r\n/g, '\n').split('\n').filter(line => {
        return !line.trim().toLowerCase().startsWith('fen:');
    }).join('\n');
}

function aiTextNeedsFenUpgrade(text) {
    if (!text || !text.trim()) return false;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let inMoveSection = false;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^\d+$/.test(t)) {
            inMoveSection = true;
            continue;
        }
        if (/^\d+\s*:\s*(white|black)\s*:/i.test(t)) {
            inMoveSection = true;
        }
        const hdr = t.match(/^(white|black)\s*:\s*(.+)$/i);
        if (!hdr) continue;
        const san = hdr[2].trim();
        if (!inMoveSection) {
            const probe = new Chess();
            if (!probe.move(san)) continue;
            inMoveSection = true;
        }
        const next = lines[i + 1];
        if (!next || !next.trim().toLowerCase().startsWith('fen:')) {
            return true;
        }
    }
    return false;
}

function insertFenLinesIntoAiTextPreserving(baseText) {
    const normalized = removeFenLines((baseText || '').replace(/\r\n/g, '\n'));
    const lines = normalized.split('\n');
    const board = new Chess();
    const out = [];
    let i = 0;
    let inMoveSection = false;
    let expectWhite = true;
    let halfMoves = 0;

    while (i < lines.length) {
        const raw = lines[i];
        const t = raw.trim();

        const legacy = t.match(/^(\d+)\s*:\s*(white|black)\s*:\s*(.+)$/i);
        const sideMatch = !legacy && t.match(/^(white|black)\s*:\s*(.+)$/i);

        let isMoveLine = false;
        let san = null;
        let side = null;

        if (legacy) {
            inMoveSection = true;
            side = legacy[2].toLowerCase();
            san = legacy[3].trim();
            isMoveLine = true;
        } else if (sideMatch) {
            side = sideMatch[1].toLowerCase();
            san = sideMatch[2].trim();
            if (!inMoveSection) {
                const probe = new Chess();
                if (probe.move(san) === null) {
                    out.push(raw);
                    i++;
                    continue;
                }
                inMoveSection = true;
            }
            isMoveLine = true;
        }

        if (isMoveLine) {
            const isWhite = side === 'white';
            if (isWhite !== expectWhite) {
                console.warn(`[ChessTextFormat] Half-move side out of sequence (expected ${expectWhite ? 'white' : 'black'}).`);
                return null;
            }
            out.push(raw);
            if (board.move(san) === null) {
                console.warn(`[ChessTextFormat] Illegal move when inserting FEN: ${san}`);
                return null;
            }
            halfMoves++;
            out.push(`fen: ${board.fen()}`);
            expectWhite = !expectWhite;
            i++;
            continue;
        }

        if (/^\d+$/.test(t)) {
            inMoveSection = true;
            out.push(raw);
            i++;
            continue;
        }

        if (t.toLowerCase().startsWith('fen:')) {
            i++;
            continue;
        }

        out.push(raw);
        i++;
    }

    const newText = out.join('\n');
    if (removeFenLines(newText) !== normalized) {
        console.warn('[ChessTextFormat] FEN insert would alter non-FEN text; aborting.');
        return null;
    }

    return {
        newText,
        halfMoves,
        fensInserted: halfMoves,
        finalFen: board.fen()
    };
}

function upgradeAiTextFormatWithFens(storedAiText) {
    console.log('[ChessTextFormat] Adding FEN lines only');
    const oldText = (storedAiText || '').replace(/\r\n/g, '\n');
    const base = removeFenLines(oldText);
    const result = insertFenLinesIntoAiTextPreserving(base);
    if (!result) {
        console.warn('[ChessTextFormat] Original format preserved: false');
        return null;
    }
    const preserved = removeFenLines(result.newText) === base && base === removeFenLines(oldText);
    console.log(`[ChessTextFormat] Original format preserved: ${preserved}`);
    if (!preserved) {
        console.warn('[ChessTextFormat] FEN upgrade validation failed (removeFenLines mismatch).');
        return null;
    }
    console.log(`[ChessTextFormat] Half-moves found: ${result.halfMoves}`);
    console.log(`[ChessTextFormat] FEN lines inserted: ${result.fensInserted}`);
    console.log(`[ChessTextFormat] Final FEN: ${result.finalFen}`);
    return result.newText;
}

function convertPgnToAiTextFormat(pgn) {
    if (!pgn) return '';

    const tempGame = new Chess();
    if (!tempGame.load_pgn(pgn)) {
        console.error('[ChessTextFormat] Error: Failed to load PGN');
        return '';
    }

    const headers = tempGame.header();
    const history = tempGame.history({ verbose: true });

    let aiText = '';
    const desiredHeaders = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    desiredHeaders.forEach(h => {
        if (headers[h]) {
            aiText += `${h.toLowerCase()}: ${headers[h]}\n`;
        }
    });
    aiText += '\n';

    const board = new Chess();
    let halfMoves = 0;
    let fenInserted = 0;

    for (let i = 0; i < history.length; i++) {
        const move = history[i];
        board.move(move);

        const moveNumber = Math.floor(i / 2) + 1;
        const side = (i % 2 === 0) ? 'white' : 'black';
        const moveSAN = move.san;
        const currentFen = board.fen();

        if (side === 'white') {
            aiText += `${moveNumber}\n`;
            aiText += `white: ${moveSAN}\n`;
            aiText += `fen: ${currentFen}\n`;
        } else {
            aiText += `black: ${moveSAN}\n`;
            aiText += `fen: ${currentFen}\n\n`;
        }

        halfMoves++;
        fenInserted++;
    }

    const out = aiText.trim();
    const roundTrip = insertFenLinesIntoAiTextPreserving(removeFenLines(out));
    const selfConsistent = roundTrip && roundTrip.newText === out;
    if (!selfConsistent) {
        console.warn('[ChessTextFormat] PGN output failed FEN round-trip self-check.');
    }
    console.log(`[ChessTextFormat] Original format preserved: ${selfConsistent}`);
    console.log(`[ChessTextFormat] Half-moves found: ${halfMoves}`);
    console.log(`[ChessTextFormat] FEN lines inserted: ${fenInserted}`);
    console.log(`[ChessTextFormat] Final FEN: ${board.fen()}`);

    return out;
}

module.exports = {
    removeFenLines,
    aiTextNeedsFenUpgrade,
    insertFenLinesIntoAiTextPreserving,
    upgradeAiTextFormatWithFens,
    convertPgnToAiTextFormat
};
