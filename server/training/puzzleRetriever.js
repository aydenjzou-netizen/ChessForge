const fs = require('fs');
const path = require('path');

const PUZZLE_SOURCE_PATH = path.join(__dirname, '..', '..', 'data', 'puzzles', 'puzzles.csv.zst');
const PUZZLE_DB_PATH = path.join(__dirname, '..', '..', 'data', 'puzzles', 'puzzles.processed.json');
const PUZZLE_NOT_PREPARED_MESSAGE = 'Puzzle database has not been prepared yet. Run: python3 scripts/prepare_puzzles.py';
let lastPuzzleLoadMessage = null;

const THEME_ALIASES = {
    fork: ['fork', 'doubleAttack', 'tactic'],
    pin: ['pin', 'tactic'],
    skewer: ['skewer', 'tactic'],
    discoveredAttack: ['discoveredAttack', 'discovered attack', 'tactic'],
    hangingPiece: ['hangingPiece', 'materialLoss', 'tactic'],
    missedCheckmate: ['missedCheckmate', 'mateIn1', 'mateIn2', 'checkmate', 'kingAttack'],
    backRank: ['backRank', 'mate', 'kingSafety'],
    kingSafety: ['kingSafety', 'kingAttack', 'checks', 'tacticalAwareness'],
    openingPrinciples: ['openingPrinciples', 'development', 'center', 'kingSafety'],
    endgameTechnique: ['endgameTechnique', 'endgame', 'pawnEndgame', 'rookEndgame', 'opposition', 'promotion'],
    pawnStructure: ['pawnStructure', 'endgame', 'strategy'],
    materialLoss: ['materialLoss', 'hangingPiece', 'badTrade', 'tactic'],
    badTrade: ['badTrade', 'materialLoss', 'queenTrade'],
    tacticalAwareness: ['tacticalAwareness', 'tactic', 'checks', 'fork', 'pin', 'skewer']
};

const PUZZLE_DIFFICULTY_BANDS = Object.freeze([
    { minLevel: 1, maxLevel: 3, minRating: 400, maxRating: 750, label: 'very easy' },
    { minLevel: 4, maxLevel: 7, minRating: 550, maxRating: 950, label: 'easy' },
    { minLevel: 8, maxLevel: 12, minRating: 750, maxRating: 1300, label: 'medium' },
    { minLevel: 13, maxLevel: 20, minRating: 1000, maxRating: 1750, label: 'harder' },
    { minLevel: 21, maxLevel: Infinity, minRating: 1350, maxRating: 2400, label: 'advanced' }
]);

function parseThemes(themes) {
    if (Array.isArray(themes)) return themes.map(t => String(t).trim()).filter(Boolean);
    return String(themes || '')
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(Boolean);
}

function stablePuzzleIdFromFields({ puzzleId, id, fen, moves, themes }) {
    const existingId = puzzleId || id;
    if (existingId) return String(existingId);
    const key = `${fen || ''}|${moves || ''}|${parseThemes(themes).join(',')}`;
    let hash = 5381;
    for (let index = 0; index < key.length; index++) {
        hash = ((hash << 5) + hash) ^ key.charCodeAt(index);
    }
    return `generated-${(hash >>> 0).toString(36)}`;
}

function loadPuzzles() {
    console.log('[PuzzleRetriever] Loading processed puzzle database');
    lastPuzzleLoadMessage = null;

    if (!fs.existsSync(PUZZLE_DB_PATH)) {
        const CSV_PATH = path.join(__dirname, '..', '..', 'data', 'puzzles', 'lichess_db_puzzle.csv');
        if (fs.existsSync(CSV_PATH)) {
            console.log('[PuzzleRetriever] Processed JSON not found, but raw CSV found. Streaming first 20MB as fallback.');
            try {
                const fd = fs.openSync(CSV_PATH, 'r');
                const buffer = Buffer.alloc(20 * 1024 * 1024); // 20MB
                const bytesRead = fs.readSync(fd, buffer, 0, 20 * 1024 * 1024, 0);
                fs.closeSync(fd);
                const content = buffer.toString('utf8', 0, bytesRead);
                const lines = content.split(/\r?\n/);
                const loaded = [];
                for (let i = 1; i < lines.length; i++) { // Skip header row
                    const line = lines[i].trim();
                    if (!line) continue;
                    const parts = line.split(',');
                    if (parts.length >= 8) {
                        const puzzleId = parts[0];
                        const fen = parts[1];
                        const moves = parts[2];
                        const rating = Number(parts[3]) || null;
                        const themes = parseThemes(parts[7]);
                        const source = parts[8] || 'puzzle-dataset';
                        const description = `Practice puzzle with themes: ${themes.join(', ')}`;
                        if (fen && moves) {
                            loaded.push({
                                puzzleId: stablePuzzleIdFromFields({ puzzleId, fen, moves, themes }),
                                fen,
                                moves,
                                rating,
                                themes,
                                description,
                                source
                            });
                        }
                    }
                }
                console.log(`[PuzzleRetriever] Loaded ${loaded.length} fallback puzzles from CSV`);
                lastPuzzleLoadMessage = 'Using fallback database from raw CSV (first 100,000 puzzles)';
                return loaded;
            } catch (err) {
                console.error('[PuzzleRetriever] Error reading fallback CSV:', err);
            }
        }

        lastPuzzleLoadMessage = PUZZLE_NOT_PREPARED_MESSAGE;
        console.warn(lastPuzzleLoadMessage);
        console.log('[PuzzleRetriever] Puzzles loaded: 0');
        return [];
    }

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(PUZZLE_DB_PATH, 'utf8'));
    } catch (err) {
        lastPuzzleLoadMessage = PUZZLE_NOT_PREPARED_MESSAGE;
        console.warn(`[PuzzleRetriever] Failed to load processed puzzle database: ${err.message}`);
        console.log('[PuzzleRetriever] Puzzles loaded: 0');
        return [];
    }

    const rows = Array.isArray(parsed) ? parsed : (parsed.puzzles || []);
    const puzzles = rows.map(row => ({
        puzzleId: stablePuzzleIdFromFields({
            puzzleId: row.puzzleId || row.PuzzleId || row.id,
            fen: row.fen || row.FEN,
            moves: row.moves || row.Moves,
            themes: row.themes || row.Themes
        }),
        fen: row.fen || row.FEN,
        moves: row.moves || row.Moves,
        rating: Number(row.rating || row.Rating) || null,
        themes: parseThemes(row.themes || row.Themes),
        description: row.description || row.Description,
        source: row.source || row.Source
    })).filter(p => p.puzzleId && p.fen && p.moves);

    console.log(`[PuzzleRetriever] Puzzles loaded: ${puzzles.length}`);
    return puzzles;
}

function getPuzzleLoadMessage() {
    return lastPuzzleLoadMessage;
}

function getPuzzleDatabaseStatusMessage() {
    if (fs.existsSync(PUZZLE_DB_PATH)) return null;
    const CSV_PATH = path.join(__dirname, '..', '..', 'data', 'puzzles', 'lichess_db_puzzle.csv');
    if (fs.existsSync(CSV_PATH)) return 'Using fallback database from raw CSV (first 100,000 puzzles)';
    return PUZZLE_NOT_PREPARED_MESSAGE;
}

function tagsForWeakness(theme) {
    return THEME_ALIASES[theme] || [theme];
}

function normalizeTargetRating(value) {
    const rating = Number(value);
    return Number.isFinite(rating) && rating > 0 ? rating : null;
}

function normalizeLevel(value) {
    const level = Number(value);
    return Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
}

function clampRating(value) {
    return Math.max(400, Math.min(2600, Math.round(Number(value) || 400)));
}

function getDifficultyRangeForLevel(level, options = {}) {
    const normalizedLevel = normalizeLevel(level);
    const band = PUZZLE_DIFFICULTY_BANDS.find(item => normalizedLevel >= item.minLevel && normalizedLevel <= item.maxLevel)
        || PUZZLE_DIFFICULTY_BANDS[PUZZLE_DIFFICULTY_BANDS.length - 1];
    const span = band.maxRating - band.minRating;
    const position = Number.isFinite(band.maxLevel)
        ? (normalizedLevel - band.minLevel) / Math.max(1, band.maxLevel - band.minLevel + 1)
        : Math.min(1, (normalizedLevel - band.minLevel) / 24);
    const gradualLift = Math.round(span * 0.22 * Math.max(0, Math.min(1, position)));
    let min = clampRating(band.minRating + gradualLift);
    let max = clampRating(band.maxRating + gradualLift);

    if (options.boss === true) {
        const width = Math.max(120, max - min);
        min = clampRating(max - Math.round(width * 0.45));
        max = clampRating(max + 150);
    }

    return {
        level: normalizedLevel,
        min,
        max,
        target: clampRating(min + ((max - min) * (options.boss === true ? 0.75 : 0.5))),
        label: options.boss === true ? `${band.label} boss` : band.label,
        boss: options.boss === true
    };
}

function expandDifficultyRange(range, step = 150, maxExpansion = 450) {
    const normalized = range || getDifficultyRangeForLevel(1);
    const expansions = [];
    for (let expansion = 0; expansion <= maxExpansion; expansion += step) {
        expansions.push({
            ...normalized,
            min: clampRating(normalized.min - expansion),
            max: clampRating(normalized.max + expansion),
            expansion
        });
    }
    return expansions;
}

function puzzleInDifficultyRange(puzzle, range) {
    if (!range || !puzzle.rating) return true;
    const rating = Number(puzzle.rating);
    return Number.isFinite(rating) && rating >= range.min && rating <= range.max;
}

function puzzleRatingDistance(puzzle, targetRating) {
    if (!targetRating || !puzzle.rating) return 0;
    return Math.abs(Number(puzzle.rating) - targetRating);
}

function shuffled(items) {
    return [...items].sort(() => Math.random() - 0.5);
}

function getPuzzlesForTheme(theme, options = {}) {
    const limit = options.limit || 12;
    const puzzles = options.puzzles || loadPuzzles();
    const wanted = new Set(tagsForWeakness(theme).map(t => t.toLowerCase()));
    const levelRange = options.level
        ? getDifficultyRangeForLevel(options.level, { boss: options.boss === true })
        : null;
    const targetRating = normalizeTargetRating(options.targetRating) || (levelRange && levelRange.target);
    const ratingWindow = Number(options.ratingWindow) || 250;
    const excludedIds = new Set((options.excludeIds || []).map(id => String(id)));

    const scored = puzzles
        .filter(puzzle => !excludedIds.has(String(puzzle.puzzleId)))
        .map(puzzle => {
            const puzzleThemes = puzzle.themes.map(t => t.toLowerCase());
            const score = puzzleThemes.reduce((sum, tag) => sum + (wanted.has(tag) ? 1 : 0), 0);
            return { puzzle, score };
        })
        .filter(item => item.score > 0);

    let candidates = scored;
    let appliedDifficultyRange = null;
    if (levelRange) {
        let closestRanged = [];
        for (const range of expandDifficultyRange(levelRange)) {
            const ranged = scored.filter(item => puzzleInDifficultyRange(item.puzzle, range));
            if (ranged.length > closestRanged.length) closestRanged = ranged;
            if (ranged.length >= Math.min(limit, 3)) {
                candidates = ranged;
                appliedDifficultyRange = range;
                break;
            }
        }
        if (!appliedDifficultyRange) {
            candidates = closestRanged;
            appliedDifficultyRange = levelRange;
        }
    }

    const ratingMatched = targetRating
        ? candidates.filter(item => item.puzzle.rating && puzzleRatingDistance(item.puzzle, targetRating) <= ratingWindow)
        : candidates;
    candidates = ratingMatched.length >= Math.min(limit, 3) ? ratingMatched : candidates;

    const ranked = candidates
        .sort((a, b) => {
            const themeScore = b.score - a.score;
            if (themeScore !== 0) return themeScore;
            if (targetRating) {
                return puzzleRatingDistance(a.puzzle, targetRating) - puzzleRatingDistance(b.puzzle, targetRating);
            }
            return (a.puzzle.rating || 0) - (b.puzzle.rating || 0);
        });
    const candidatePool = ranked.slice(0, Math.max(limit * 8, 40));

    return shuffled(candidatePool)
        .slice(0, limit)
        .map(item => ({
            ...item.puzzle,
            difficultyRange: appliedDifficultyRange || levelRange || null
        }));
}

function selectPuzzleForLevel(level, themes, options = {}) {
    const themeList = Array.isArray(themes) ? themes : [themes || 'tacticalAwareness'];
    const puzzles = options.puzzles || loadPuzzles();
    const seen = new Set();
    const selected = [];
    themeList.filter(Boolean).forEach(theme => {
        getPuzzlesForTheme(theme, {
            ...options,
            puzzles,
            level,
            limit: options.limit || 12
        }).forEach(puzzle => {
            if (seen.has(puzzle.puzzleId)) return;
            seen.add(puzzle.puzzleId);
            selected.push({ ...puzzle, matchedWeakness: theme });
        });
    });
    return selected.slice(0, options.limit || 12);
}

function recommendPuzzles(weaknesses, options = {}) {
    const puzzles = options.puzzles || loadPuzzles();
    const limitPerTheme = options.limitPerTheme || 4;
    const targetRating = normalizeTargetRating(options.targetRating);
    const ratingWindow = Number(options.ratingWindow) || 250;
    const excludeIds = options.excludeIds || [];
    const seen = new Set();
    const recommendations = [];

    weaknesses.forEach(weakness => {
        getPuzzlesForTheme(weakness.theme, { puzzles, limit: limitPerTheme, targetRating, ratingWindow, excludeIds }).forEach(puzzle => {
            if (seen.has(puzzle.puzzleId)) return;
            seen.add(puzzle.puzzleId);
            recommendations.push({
                ...puzzle,
                matchedWeakness: weakness.theme
            });
        });
    });

    console.log(`[TrainingCoach] Recommended puzzles: ${recommendations.length}`);
    return recommendations;
}

module.exports = {
    PUZZLE_DB_PATH,
    PUZZLE_SOURCE_PATH,
    PUZZLE_NOT_PREPARED_MESSAGE,
    THEME_ALIASES,
    loadPuzzles,
    getPuzzleLoadMessage,
    getPuzzleDatabaseStatusMessage,
    parseThemes,
    tagsForWeakness,
    getDifficultyRangeForLevel,
    selectPuzzleForLevel,
    getPuzzlesForTheme,
    recommendPuzzles
};
