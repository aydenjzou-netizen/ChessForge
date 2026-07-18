(function () {
    const TRAINING_API_BASE = 'http://localhost:3001/api/training';
    const BACKEND_OFFLINE_MESSAGE = 'Training Coach API is offline. Start it with: npm run backend';

    let profile = null;
    let puzzleBoard = null;
    let puzzleGame = null;
    let activePuzzles = [];
    let activePuzzleIndex = -1;
    let solutionMoves = [];
    let solutionIndex = 0;
    let puzzleInteractiveStartIndex = 0;
    let puzzleStartFen = 'start';
    let puzzleSolverSide = 'white';
    let activePuzzleTheme = null;
    let activePuzzleTargetRating = null;
    let puzzleSetResults = new Map();
    let currentPuzzleHadMistake = false;
    let currentStreak = 0;
    let bestSessionStreak = 0;
    const maxHp = 5;
    const BOSS_MODE = 'boss';
    const NORMAL_MODE = 'normal';
    const GENERAL_MODE = 'general';
    const GENERAL_TRAINING_THEMES = Object.freeze([
        'tacticalAwareness',
        'fork',
        'pin',
        'skewer',
        'missedCheckmate',
        'endgameTechnique',
        'pieceSafety'
    ]);
    const CHAPTER_SEQUENCE = Object.freeze([
        'Tactical Vision',
        'Fork Fundamentals',
        'Piece Safety',
        'Checkmate Patterns',
        'Endgame Survival'
    ]);
    const WEAKNESS_CHAPTERS = Object.freeze({
        fork: 'Fork Fundamentals',
        forks: 'Fork Fundamentals',
        tactic: 'Tactical Vision',
        tacticalAwareness: 'Tactical Vision',
        pieceSafety: 'Piece Safety',
        hangingPiece: 'Piece Safety',
        mate: 'Checkmate Patterns',
        checkmate: 'Checkmate Patterns',
        endgame: 'Endgame Survival',
        rookEndgame: 'Rook Endgame Survival'
    });
    const BOSS_CATALOG = Object.freeze([
        { id: 'tactics-goblin', name: 'Tactics Goblin', icon: '♛', preferredModifiers: ['theme-tactics', 'theme-forks', 'streak-3', 'streak-5'], baseReward: 150 },
        { id: 'endgame-titan', name: 'Endgame Titan', icon: '♛', preferredModifiers: ['theme-endgames', 'lives-2', 'timer-20', 'solve-7'], baseReward: 190 },
        { id: 'calculation-demon', name: 'Calculation Demon', icon: '♛', preferredModifiers: ['timer-10', 'timer-15', 'difficulty-advanced', 'difficulty-expert'], baseReward: 230 },
        { id: 'defensive-fortress', name: 'Defensive Fortress', icon: '♛', preferredModifiers: ['theme-pins', 'lives-2', 'solve-10', 'difficulty-advanced'], baseReward: 260 },
        { id: 'fork-master', name: 'Fork Master', icon: '♛', preferredModifiers: ['theme-forks', 'streak-5', 'difficulty-advanced'], baseReward: 280 },
        { id: 'checkmate-dragon', name: 'Checkmate Dragon', icon: '♛', preferredModifiers: ['theme-mates', 'timer-15', 'streak-7', 'difficulty-expert'], baseReward: 320 }
    ]);
    const BOSS_MILESTONES = Object.freeze([
        { level: 3, bossId: 'tactics-goblin' },
        { level: 6, bossId: 'endgame-titan' },
        { level: 9, bossId: 'calculation-demon' },
        { level: 12, bossId: 'defensive-fortress' },
        { level: 15, bossId: 'fork-master' },
        { level: 18, bossId: 'checkmate-dragon' }
    ]);
    const BOSS_MODIFIERS = Object.freeze([
        { id: 'lives-1', type: 'lives', value: 1, label: 'One Life', description: 'One mistake ends the battle.', rewardBonus: 70 },
        { id: 'lives-2', type: 'lives', value: 2, label: 'Two Lives', description: 'You can survive one mistake.', rewardBonus: 45 },
        { id: 'lives-3', type: 'lives', value: 3, label: 'Three Lives', description: 'Three total lives.', rewardBonus: 20 },
        { id: 'timer-10', type: 'timer', value: 10, label: '10 Second Timer', description: 'Each puzzle must be solved in 10 seconds.', rewardBonus: 70 },
        { id: 'timer-15', type: 'timer', value: 15, label: '15 Second Timer', description: 'Each puzzle must be solved in 15 seconds.', rewardBonus: 50 },
        { id: 'timer-20', type: 'timer', value: 20, label: '20 Second Timer', description: 'Each puzzle must be solved in 20 seconds.', rewardBonus: 35 },
        { id: 'timer-30', type: 'timer', value: 30, label: '30 Second Timer', description: 'Each puzzle must be solved in 30 seconds.', rewardBonus: 20 },
        { id: 'difficulty-normal', type: 'difficulty', value: 'normal', label: 'Normal Difficulty', description: 'Standard puzzle rating.', rewardBonus: 0 },
        { id: 'difficulty-advanced', type: 'difficulty', value: 'advanced', label: 'Advanced Difficulty', description: 'Higher-rated puzzles.', rewardBonus: 40 },
        { id: 'difficulty-expert', type: 'difficulty', value: 'expert', label: 'Expert Difficulty', description: 'Much harder puzzles.', rewardBonus: 80 },
        { id: 'solve-5', type: 'objective', value: 5, label: 'Solve 5 Puzzles', description: 'Win by solving 5 boss puzzles.', rewardBonus: 0 },
        { id: 'solve-7', type: 'objective', value: 7, label: 'Solve 7 Puzzles', description: 'Win by solving 7 boss puzzles.', rewardBonus: 45 },
        { id: 'solve-10', type: 'objective', value: 10, label: 'Solve 10 Puzzles', description: 'Win by solving 10 boss puzzles.', rewardBonus: 90 },
        { id: 'streak-3', type: 'objective', objectiveType: 'consecutive', value: 3, label: '3 Consecutive Wins', description: 'Win with 3 correct puzzles in a row.', rewardBonus: 45 },
        { id: 'streak-5', type: 'objective', objectiveType: 'consecutive', value: 5, label: '5 Consecutive Wins', description: 'Win with 5 correct puzzles in a row.', rewardBonus: 90 },
        { id: 'streak-7', type: 'objective', objectiveType: 'consecutive', value: 7, label: '7 Consecutive Wins', description: 'Win with 7 correct puzzles in a row.', rewardBonus: 135 },
        { id: 'theme-tactics', type: 'theme', value: 'tacticalAwareness', label: 'Mixed Tactics', description: 'Mixed tactical puzzles.', rewardBonus: 0 },
        { id: 'theme-forks', type: 'theme', value: 'fork', label: 'Forks Only', description: 'Fork-themed puzzles.', rewardBonus: 20 },
        { id: 'theme-pins', type: 'theme', value: 'pin', label: 'Pins Only', description: 'Pin-themed puzzles.', rewardBonus: 20 },
        { id: 'theme-skewers', type: 'theme', value: 'skewer', label: 'Skewers Only', description: 'Skewer-themed puzzles.', rewardBonus: 25 },
        { id: 'theme-mates', type: 'theme', value: 'missedCheckmate', label: 'Mates Only', description: 'Checkmate pattern puzzles.', rewardBonus: 30 },
        { id: 'theme-endgames', type: 'theme', value: 'endgameTechnique', label: 'Endgames Only', description: 'Endgame puzzles only.', rewardBonus: 30 },
        { id: 'theme-weakness', type: 'theme', value: 'weakness', label: 'Weakness Targeted', description: 'Uses your current Chess.com weakness when available.', rewardBonus: 35 }
    ]);
    const DEFAULT_BOSS_MODIFIER_IDS = Object.freeze(['lives-3', 'solve-5']);
    let currentHp = maxHp;
    const XP_PER_CORRECT_PUZZLE = 20;
    const XP_STREAK_BONUS = 5;
    const XP_STREAK_BONUS_THRESHOLD = 3;
    const TOTAL_XP_KEY = 'training_total_xp';
    const PLAYER_PROFILE_KEY = 'training_player_profile';
    const WEAKNESS_PROFILE_KEY = 'training_weakness_profile';
    const ACTIVITY_LOG_KEY = 'chess_recent_activity';
    const XP_PER_LEVEL = 100;
    const DEFAULT_PLAYER_PROFILE = Object.freeze({
        totalXp: 0,
        bestOverallStreak: 0,
        totalPuzzlesAttempted: 0,
        totalPuzzlesSolved: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        totalSessionsPlayed: 0,
        highestLevelReached: 1,
        totalGameOvers: 0,
        bossWins: 0,
        bossesDefeated: {},
        bossDefeatXp: {},
        currentBossLevelUnlocked: null,
        currentLevelXp: 0,
        completedPuzzleIds: [],
        lastPlayedAt: null
    });
    let sessionXp = 0;
    let totalXp = 0;
    let startingLevel = 1;
    let sessionSummaryRecorded = false;
    let playerProfile = { ...DEFAULT_PLAYER_PROFILE };
    let sessionEndedBy = 'active';
    let sessionMode = NORMAL_MODE;
    let isBossBattleActive = false;
    let activeBoss = null;
    let activeBossLevel = null;
    let bossLevel = null;
    let bossName = '';
    let bossRequiredCorrect = 0;
    let bossCorrectCount = 0;
    let bossPlayerHp = 0;
    let bossWon = false;
    let bossLost = false;
    let bossCorrect = 0;
    let bossBonusXp = 0;
    let activeBossChallenge = null;
    let bossTimerSeconds = null;
    let bossTimerRemaining = null;
    let bossTimerId = null;
    let savedWeaknessProfile = null;
    let pendingPuzzleReward = null;
    const rewardAnimationKeys = new Set();
    const els = {};

    function getActiveAccountProfile() {
        return typeof window.getActiveProfile === 'function' ? window.getActiveProfile() : null;
    }

    function updateActiveAccountProfile(updater) {
        if (typeof window.updateActiveProfileProgress === 'function') {
            return window.updateActiveProfileProgress(updater);
        }
        return null;
    }

    function readTrainingJson(key, fallback = null) {
        const activeProfile = getActiveAccountProfile();
        if (activeProfile) {
            if (key === PLAYER_PROFILE_KEY) return activeProfile.trainingPlayerProfile || fallback;
            if (key === WEAKNESS_PROFILE_KEY) return activeProfile.weaknessProfile || fallback;
            if (key === ACTIVITY_LOG_KEY) return Array.isArray(activeProfile.activityLog) ? activeProfile.activityLog : fallback;
        }
        try {
            const stored = JSON.parse(localStorage.getItem(key) || 'null');
            return stored === null ? fallback : stored;
        } catch (err) {
            return fallback;
        }
    }

    function writeTrainingJson(key, value) {
        if (key === PLAYER_PROFILE_KEY) {
            const completedPuzzleIds = Array.isArray(value && value.completedPuzzleIds) ? value.completedPuzzleIds : [];
            const puzzlesSolved = completedPuzzleIds.length
                || Math.max(0, Math.floor(Number(value && (value.totalPuzzlesSolved || value.totalCorrect)) || 0));
            updateActiveAccountProfile(profileRecord => ({
                ...profileRecord,
                trainingPlayerProfile: value || {},
                completedPuzzleIds,
                puzzlesSolved,
                trainingStats: {
                    ...(profileRecord.trainingStats || {}),
                    totalPuzzlesAttempted: Math.max(0, Math.floor(Number(value && value.totalPuzzlesAttempted) || 0)),
                    totalPuzzlesSolved: puzzlesSolved,
                    totalCorrect: Math.max(0, Math.floor(Number(value && value.totalCorrect) || 0)),
                    totalIncorrect: Math.max(0, Math.floor(Number(value && value.totalIncorrect) || 0)),
                    totalSessionsPlayed: Math.max(0, Math.floor(Number(value && value.totalSessionsPlayed) || 0)),
                    bestOverallStreak: Math.max(0, Math.floor(Number(value && value.bestOverallStreak) || 0)),
                    totalGameOvers: Math.max(0, Math.floor(Number(value && value.totalGameOvers) || 0)),
                    bossWins: Math.max(0, Math.floor(Number(value && value.bossWins) || 0))
                },
                totalXp: Math.max(0, Math.floor(Number(value && value.totalXp) || 0)),
                xp: Math.max(0, Math.floor(Number(value && value.totalXp) || 0)),
                streak: Math.max(0, Math.floor(Number(currentStreak) || 0)),
                hp: currentHp,
                currentHp,
                sessionXp
            }));
        } else if (key === WEAKNESS_PROFILE_KEY) {
            const weakness = value && (value.weaknessProfile || value);
            const profileData = weakness && weakness.profileData || {};
            const ratingRange = profileData.puzzleRatingRange || {};
            const analyzedCount = weakness && Array.isArray(weakness.analyzedGameIds)
                ? weakness.analyzedGameIds.length
                : Math.max(0, Math.floor(Number(profileData.gamesAnalyzed || 0) || 0));
            const estimatedRating = Math.max(0, Math.floor(Number(profileData.estimatedPuzzleRating || profileData.estimatedRating || ratingRange.min || 0) || 0));
            const weaknesses = weakness && Array.isArray(weakness.topWeaknesses)
                ? weakness.topWeaknesses.map(item => typeof item === 'string' ? item : item && item.theme).filter(Boolean)
                : [];
            updateActiveAccountProfile(profileRecord => ({
                ...profileRecord,
                weaknessProfile: value || null,
                gamesAnalyzed: analyzedCount,
                estimatedRating: estimatedRating || profileRecord.estimatedRating || 0,
                weaknesses
            }));
        } else if (key === ACTIVITY_LOG_KEY) {
            updateActiveAccountProfile(profileRecord => ({
                ...profileRecord,
                activityLog: Array.isArray(value) ? value : []
            }));
        }
        localStorage.setItem(key, JSON.stringify(value));
    }

    function removeTrainingJson(key) {
        if (key === WEAKNESS_PROFILE_KEY) {
            updateActiveAccountProfile(profileRecord => ({
                ...profileRecord,
                weaknessProfile: null,
                gamesAnalyzed: 0,
                estimatedRating: 0,
                weaknesses: []
            }));
        }
        localStorage.removeItem(key);
    }

    function getStoredTotalXp() {
        const activeProfile = getActiveAccountProfile();
        if (activeProfile) return Math.max(0, Math.floor(Number(activeProfile.totalXp || activeProfile.xp || 0) || 0));
        return toStoredCount(localStorage.getItem(TOTAL_XP_KEY));
    }

    function getStoredStreak(fallback = 0) {
        const activeProfile = getActiveAccountProfile();
        if (activeProfile) return Math.max(0, Math.floor(Number(activeProfile.streak || 0) || 0));
        return Math.max(0, Math.floor(Number(localStorage.getItem('training_current_streak') || fallback || 0) || 0));
    }

    function setStoredStreak(value) {
        const nextStreak = Math.max(0, Math.floor(Number(value) || 0));
        currentStreak = nextStreak;
        localStorage.setItem('training_current_streak', String(nextStreak));
        updateActiveAccountProfile(profileRecord => ({
            ...profileRecord,
            streak: nextStreak,
            hp: currentHp,
            currentHp,
            sessionXp,
            trainingPlayerProfile: {
                ...(profileRecord.trainingPlayerProfile || playerProfile || {}),
                currentStreak: nextStreak
            }
        }));
    }

    function readActivityLog() {
        try {
            const stored = readTrainingJson(ACTIVITY_LOG_KEY, []);
            return Array.isArray(stored) ? stored.filter(Boolean) : [];
        } catch (err) {
            console.warn('[TrainingCoach] Could not read activity log:', err);
            return [];
        }
    }

    function recordActivity(entry) {
        const timestamp = Date.now();
        const normalized = {
            id: entry.id || `activity_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
            type: entry.type || 'training',
            icon: entry.icon || '✚',
            title: entry.title || 'Training activity',
            detail: entry.detail || '',
            xp: entry.xp || '',
            timestamp,
            accent: entry.accent || 'green'
        };
        const dedupeKey = [normalized.type, normalized.title, normalized.detail].join('|');
        const nextLog = [
            normalized,
            ...readActivityLog().filter(activity => [activity.type, activity.title, activity.detail].join('|') !== dedupeKey)
        ].slice(0, 50);
        writeTrainingJson(ACTIVITY_LOG_KEY, nextLog);
        if (typeof window.recordChessSystemActivity === 'function') {
            window.recordChessSystemActivity(normalized);
        }
    }

    function titleCaseTheme(theme) {
        return String(theme || '')
            .replace(/([A-Z])/g, ' $1')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^./, c => c.toUpperCase())
            .trim();
    }

    function normalizeThemeList(value) {
        if (Array.isArray(value)) {
            return value.flatMap(item => normalizeThemeList(item)).filter(Boolean);
        }
        if (value && typeof value === 'object') {
            return normalizeThemeList(Object.values(value));
        }
        return String(value || '')
            .split(/[,\s;|]+/)
            .map(theme => theme.trim())
            .filter(Boolean);
    }

    function getPuzzleFen(puzzle) {
        if (!puzzle) return '';
        return puzzle.fen
            || puzzle.FEN
            || puzzle.startFen
            || puzzle.startingFen
            || puzzle.initialFen
            || (puzzle.position && (puzzle.position.fen || puzzle.position.FEN))
            || (puzzle.state && (puzzle.state.fen || puzzle.state.FEN))
            || '';
    }

    function getSideToMove(fen) {
        const side = String(fen || '').trim().split(/\s+/)[1];
        if (side === 'w') return 'White';
        if (side === 'b') return 'Black';
        return null;
    }

    function formatPuzzleThemes(puzzle) {
        const rawThemes = [
            puzzle && puzzle.themes,
            puzzle && puzzle.Themes,
            puzzle && puzzle.tags,
            puzzle && puzzle.Tags,
            puzzle && puzzle.theme,
            puzzle && puzzle.Theme,
            puzzle && puzzle.category
        ];
        const themes = Array.from(new Set(rawThemes.flatMap(normalizeThemeList)));
        if (!themes.length) return 'Themes: Mixed tactics';
        return `Themes: ${themes.map(titleCaseTheme).join(', ')}`;
    }

    function updatePuzzleGoalCard(puzzle) {
        if (!els.goalText || !els.goalThemes) return;
        if (!puzzle) {
            els.goalText.innerText = activePuzzles.length
                ? 'Choose a puzzle to begin.'
                : 'Load a puzzle to see your goal.';
            els.goalThemes.innerText = 'Themes: Mixed tactics';
            return;
        }

        const side = activePuzzleIndex >= 0
            ? (puzzleSolverSide === 'black' ? 'Black' : 'White')
            : (getSideToMove(getPuzzleFen(puzzle)) || 'White');
        els.goalText.innerText = `Find the best move for ${side}.`;
        els.goalThemes.innerText = formatPuzzleThemes(puzzle);
    }

    function parseTrainingGameTimestamp(game) {
        const candidates = [
            game && game.createdAt,
            game && game.savedAt,
            game && game.chessCom && game.chessCom.endTime,
            game && game.chessCom && game.chessCom.end_time,
            game && game.gameMetadata && game.gameMetadata.endTime,
            game && game.gameMetadata && game.gameMetadata.end_time,
            game && game.gameMetadata && game.gameMetadata.date,
            game && game.headers && game.headers.UTCDate,
            game && game.headers && game.headers.Date,
            game && game.UTCDate,
            game && game.Date,
            game && game.date
        ];

        for (const value of candidates) {
            if (value === null || value === undefined || value === '') continue;
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value > 10000000000 ? value : value * 1000;
            }
            const raw = String(value).trim();
            if (!raw || raw.includes('?')) continue;
            if (/^\d{10,13}$/.test(raw)) {
                const numeric = Number(raw);
                return numeric > 10000000000 ? numeric : numeric * 1000;
            }
            const normalized = /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(raw) ? raw.replace(/\./g, '-') : raw;
            const timestamp = Date.parse(normalized);
            if (Number.isFinite(timestamp)) return timestamp;
        }

        return 0;
    }

    function sortGamesNewestFirst(games) {
        return (Array.isArray(games) ? games : [])
            .filter(Boolean)
            .slice()
            .sort((a, b) => parseTrainingGameTimestamp(b) - parseTrainingGameTimestamp(a));
    }

    function getTrainingGameLabel(game) {
        return {
            id: game && game.id,
            title: game && (game.title || game.name || (game.headers && game.headers.Event) || 'Untitled Game')
        };
    }

    function isCompressedTrainingGame(game) {
        if (!game) return false;
        return game.storageMode === 'gzip'
            || game.isCompressed === true
            || Boolean(game.compression)
            || Boolean(game.compressed)
            || Boolean(game.compressedFields)
            || Boolean(game.compressedPgn)
            || Boolean(game.compressedPGN)
            || Boolean(game.compressedRawPGN)
            || Boolean(game.compressedRawPgn);
    }

    function needsFullTrainingGameFetch(game) {
        if (!game || !game.id || game.__trainingSource !== 'backend') return false;
        const pgn = game.pgn || game.rawPGN || '';
        return !String(pgn || '').trim() || game.storageMode === 'metadata-only' || isCompressedTrainingGame(game);
    }

    async function fetchFullTrainingGame(game) {
        if (!needsFullTrainingGameFetch(game)) return game;
        const response = await fetch(`http://localhost:3001/api/games/${encodeURIComponent(game.id)}`);
        if (!response.ok) throw new Error(`Game detail request returned ${response.status}`);
        return response.json();
    }

    function readLegacyBrowserGamesForTraining() {
        try {
            const stored = JSON.parse(localStorage.getItem('chess_saved_games') || '[]');
            return Array.isArray(stored) ? stored.map(game => ({ ...game, __trainingSource: 'browser' })) : [];
        } catch (err) {
            console.warn('[TrainingCoach] Could not parse legacy browser saved games for analysis.', err);
            return [];
        }
    }

    async function loadGameSourcesForTraining() {
        const legacyGames = readLegacyBrowserGamesForTraining();
        try {
            const response = await fetch('http://localhost:3001/api/games');
            if (!response.ok) throw new Error(`Game store returned ${response.status}`);
            const backendGames = await response.json();
            if (Array.isArray(backendGames) && backendGames.length > 0) {
                const merged = backendGames.map(game => ({ ...game, __trainingSource: 'backend' }));
                const seenIds = new Set(merged.map(game => String(game.id || '')).filter(Boolean));
                legacyGames.forEach(game => {
                    const id = String(game.id || '');
                    if (id && seenIds.has(id)) return;
                    if (id) seenIds.add(id);
                    merged.push(game);
                });
                return merged;
            }
        } catch (err) {
            console.warn('[TrainingCoach] Could not load games from filesystem store for analysis.', err);
        }
        return legacyGames;
    }

    async function hydrateTrainingGameForAnalysis(game) {
        const { id, title } = getTrainingGameLabel(game);
        try {
            const detailedGame = await fetchFullTrainingGame(game);
            const runtimeGame = window.gameCompressionService && typeof window.gameCompressionService.hydrateGameForRuntime === 'function'
                ? await window.gameCompressionService.hydrateGameForRuntime(detailedGame)
                : detailedGame;

            if (runtimeGame.hydrationError) {
                throw new Error(runtimeGame.hydrationError);
            }

            const pgn = runtimeGame.pgn || runtimeGame.rawPGN || '';
            if (!String(pgn || '').trim()) {
                throw new Error('No usable PGN after decompression.');
            }

            const analysisGame = {
                ...runtimeGame,
                id: runtimeGame.id || game.id,
                title: runtimeGame.title || runtimeGame.name || game.title || game.name,
                name: runtimeGame.name || game.name,
                pgn,
                rawPGN: runtimeGame.rawPGN || pgn,
                aiTextFormat: runtimeGame.aiTextFormat || game.aiTextFormat || '',
                headers: runtimeGame.headers || game.headers,
                chessCom: runtimeGame.chessCom || game.chessCom,
                gameMetadata: runtimeGame.gameMetadata || game.gameMetadata,
                userColor: runtimeGame.userColor || game.userColor,
                createdAt: runtimeGame.createdAt || game.createdAt,
                savedAt: runtimeGame.savedAt || game.savedAt
            };
            delete analysisGame.__trainingSource;
            return analysisGame;
        } catch (err) {
            console.warn('[TrainingCoach] Skipping saved game that could not be prepared for analysis.', {
                id,
                title,
                compressed: isCompressedTrainingGame(game),
                error: err && err.message ? err.message : String(err)
            });
            return null;
        }
    }

    async function getSavedGamesForTraining() {
        const games = await loadGameSourcesForTraining();
        const sortedGames = sortGamesNewestFirst(games);
        const runtimeGames = [];

        for (const game of sortedGames) {
            const runtimeGame = await hydrateTrainingGameForAnalysis(game);
            if (runtimeGame) runtimeGames.push(runtimeGame);
        }

        return runtimeGames;
    }

    async function getSavedGameIdsForProfileCheck() {
        try {
            const response = await fetch('http://localhost:3001/api/games');
            if (!response.ok) return [];
            const games = await response.json();
            return (Array.isArray(games) ? games : []).map(getGameStableId).filter(Boolean);
        } catch (err) {
            return [];
        }
    }

    function cacheElements() {
        els.summary = document.getElementById('trainingSummary');
        els.logs = document.getElementById('trainingLogs');
        els.puzzles = document.getElementById('recommendedPuzzles');
        els.feedback = document.getElementById('puzzleFeedback');
        els.analyze = document.getElementById('btnAnalyzeTraining');
        els.generalTraining = document.getElementById('btnStartGeneralTraining');
        els.prevPuzzle = document.getElementById('btnPrevTrainingPuzzle');
        els.nextPuzzle = document.getElementById('btnNextTrainingPuzzle');
        els.prevMove = document.getElementById('btnPrevPuzzleMove');
        els.nextMove = document.getElementById('btnNextPuzzleMove');
        els.fullscreenBoard = document.getElementById('btnFullscreenPuzzleBoard');
        els.boardFullscreenTarget = document.getElementById('trainingBoardFullscreenTarget');
        els.sideToMove = document.getElementById('puzzleSideToMove');
        els.moveProgress = document.getElementById('puzzleMoveProgress');
        els.puzzleAccuracy = document.getElementById('puzzleAccuracy');
        els.currentStreak = document.getElementById('puzzleCurrentStreak');
        els.streakCallout = document.getElementById('puzzleStreakCallout');
        els.hp = document.getElementById('puzzleHp');
        els.sessionXp = document.getElementById('puzzleSessionXp');
        els.xp = document.getElementById('puzzleXp');
        els.bossStatus = document.getElementById('bossBattleStatus');
        els.bossName = document.getElementById('bossBattleName');
        els.bossHp = document.getElementById('bossBattleHp');
        els.bossProgress = document.getElementById('bossBattleProgress');
        els.puzzlesLeft = document.getElementById('puzzlesLeftInSet');
        els.goalText = document.getElementById('puzzleGoalText');
        els.goalThemes = document.getElementById('puzzleGoalThemes');
    }

    function setFeedback(text, kind) {
        if (!els.feedback) return;
        els.feedback.className = `training-feedback${kind ? ` ${kind}` : ''}`;
        els.feedback.innerText = text;
    }

    function getGameStableId(game) {
        if (!game) return null;
        return String(game.id || game.gameId || game.url || game.createdAt || game.title || game.name || '').trim() || null;
    }

    function formatProfileDate(isoDate) {
        if (!isoDate) return 'unknown date';
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) return 'unknown date';
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function buildThemeWeights(themes) {
        const uniqueThemes = Array.from(new Set((themes || []).map(theme => String(theme)).filter(Boolean)));
        if (!uniqueThemes.length) {
            return { tacticalAwareness: 1 };
        }
        const totalWeight = uniqueThemes.reduce((sum, _theme, index) => sum + Math.max(1, uniqueThemes.length - index), 0);
        return uniqueThemes.reduce((weights, theme, index) => {
            weights[theme] = Math.round((Math.max(1, uniqueThemes.length - index) / totalWeight) * 100) / 100;
            return weights;
        }, {});
    }

    function normalizeWeaknessProfileRecord(record) {
        if (!record || typeof record !== 'object') return null;
        const weaknessProfile = record.weaknessProfile && typeof record.weaknessProfile === 'object'
            ? record.weaknessProfile
            : record;
        const recommendedThemes = Array.isArray(weaknessProfile.recommendedPuzzleThemes)
            ? weaknessProfile.recommendedPuzzleThemes.map(theme => String(theme)).filter(Boolean)
            : [];
        const topWeaknesses = Array.isArray(weaknessProfile.topWeaknesses)
            ? weaknessProfile.topWeaknesses
                .map(item => typeof item === 'string' ? { theme: item, score: 1 } : item)
                .filter(item => item && item.theme)
                .map(item => ({ ...item, theme: String(item.theme), score: Number(item.score || item.confidence || 1) }))
            : recommendedThemes.map(theme => ({ theme, score: 1 }));
        const profileData = weaknessProfile.profileData || record.profileData || null;
        if (!profileData && !recommendedThemes.length && !topWeaknesses.length) return null;
        return {
            weaknessProfile: {
                analysisDate: weaknessProfile.analysisDate || weaknessProfile.analyzedAt || profileData && profileData.analyzedAt || new Date().toISOString(),
                analyzedGameIds: Array.isArray(weaknessProfile.analyzedGameIds)
                    ? weaknessProfile.analyzedGameIds.map(id => String(id)).filter(Boolean)
                    : [],
                analysisSource: weaknessProfile.analysisSource || 'local-stockfish',
                topWeaknesses,
                themeWeights: weaknessProfile.themeWeights && typeof weaknessProfile.themeWeights === 'object'
                    ? { ...weaknessProfile.themeWeights }
                    : buildThemeWeights(recommendedThemes.length ? recommendedThemes : topWeaknesses.map(item => item.theme)),
                recommendedPuzzleThemes: recommendedThemes.length ? recommendedThemes : topWeaknesses.map(item => item.theme),
                profileData
            }
        };
    }

    function getProfileFromWeaknessRecord(record) {
        const normalized = normalizeWeaknessProfileRecord(record);
        if (!normalized) return null;
        const weakness = normalized.weaknessProfile;
        const profileData = weakness.profileData || {};
        const topWeaknessThemes = weakness.topWeaknesses.map(item => item.theme);
        return {
            ...profileData,
            gamesAnalyzed: profileData.gamesAnalyzed || weakness.analyzedGameIds.length,
            estimatedRating: profileData.estimatedRating || profileData.estimatedPuzzleRating || (profileData.puzzleRatingRange && profileData.puzzleRatingRange.min) || 0,
            topWeaknesses: topWeaknessThemes,
            recommendedPuzzleThemes: weakness.recommendedPuzzleThemes,
            analyzedAt: weakness.analysisDate,
            summary: `Using saved training profile from ${formatProfileDate(weakness.analysisDate)}.`,
            logs: [`[TrainingCoach] Using saved training profile from ${formatProfileDate(weakness.analysisDate)}.`]
        };
    }

    function loadSavedWeaknessProfile() {
        try {
            const normalized = normalizeWeaknessProfileRecord(readTrainingJson(WEAKNESS_PROFILE_KEY, null));
            if (!normalized) {
                savedWeaknessProfile = null;
                return null;
            }
            savedWeaknessProfile = normalized;
            localStorage.setItem(WEAKNESS_PROFILE_KEY, JSON.stringify(normalized));
            return normalized;
        } catch (err) {
            removeTrainingJson(WEAKNESS_PROFILE_KEY);
            savedWeaknessProfile = null;
            return null;
        }
    }

    function saveWeaknessProfile(finalProfile, analyzedGames) {
        const themes = Array.from(new Set([
            ...(finalProfile.recommendedPuzzleThemes || []),
            ...(finalProfile.topWeaknesses || [])
        ].map(theme => String(theme)).filter(Boolean)));
        const topWeaknesses = (finalProfile.recurringWeaknesses || [])
            .slice(0, Math.max(3, themes.length))
            .map(item => ({ theme: item.theme, score: Number(item.confidence || item.count || 1) }))
            .filter(item => item.theme);
        const record = normalizeWeaknessProfileRecord({
            weaknessProfile: {
                analysisDate: new Date().toISOString(),
                analyzedGameIds: (analyzedGames || []).map(getGameStableId).filter(Boolean),
                analysisSource: 'local-stockfish',
                topWeaknesses: topWeaknesses.length ? topWeaknesses : themes.map(theme => ({ theme, score: 1 })),
                themeWeights: buildThemeWeights(themes),
                recommendedPuzzleThemes: themes.length ? themes : ['tacticalAwareness'],
                profileData: finalProfile
            }
        });
        savedWeaknessProfile = record;
        writeTrainingJson(WEAKNESS_PROFILE_KEY, record);
        return record;
    }

    async function showNewGamesNoticeIfNeeded() {
        if (!savedWeaknessProfile) return;
        const savedIds = new Set(savedWeaknessProfile.weaknessProfile.analyzedGameIds || []);
        const currentIds = await getSavedGameIdsForProfileCheck();
        if (!currentIds.length) return;
        const hasNewGames = currentIds.some(id => !savedIds.has(id));
        if (!hasNewGames) return;
        renderLogs([
            ...(profile && profile.logs ? profile.logs : []),
            '[TrainingCoach] New games available. Reanalyze to update your training profile.'
        ]);
        if (els.summary) {
            els.summary.innerText = `${profile.summary || ''} New games available. Reanalyze to update your training profile.`.trim();
        }
    }

    function stableHash(value) {
        const text = String(value || '');
        let hash = 5381;
        for (let index = 0; index < text.length; index++) {
            hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
        }
        return (hash >>> 0).toString(36);
    }

    function getStablePuzzleId(puzzle) {
        if (!puzzle) return null;
        const existingId = puzzle.puzzleId || puzzle.id || puzzle.PuzzleId;
        if (existingId) return String(existingId);
        const themes = Array.isArray(puzzle.themes) ? puzzle.themes.join(',') : String(puzzle.themes || '');
        return `generated-${stableHash(`${puzzle.fen || ''}|${puzzle.moves || ''}|${themes}`)}`;
    }

    function normalizePuzzleForSession(puzzle) {
        const puzzleId = getStablePuzzleId(puzzle);
        return puzzleId ? { ...puzzle, puzzleId } : puzzle;
    }

    function getCompletedPuzzleIdSet() {
        return new Set((playerProfile.completedPuzzleIds || []).map(id => String(id)).filter(Boolean));
    }

    function getCompletedPuzzleIds() {
        return Array.from(getCompletedPuzzleIdSet());
    }

    function markPuzzleCompleted(puzzle) {
        const puzzleId = getStablePuzzleId(puzzle);
        if (!puzzleId) return;
        const completed = getCompletedPuzzleIdSet();
        if (completed.has(puzzleId)) return;
        completed.add(puzzleId);
        playerProfile.completedPuzzleIds = Array.from(completed);
        savePlayerProfile();
    }

    function filterCompletedPuzzles(puzzles) {
        const completed = getCompletedPuzzleIdSet();
        return (puzzles || [])
            .map(normalizePuzzleForSession)
            .filter(puzzle => {
                const puzzleId = getStablePuzzleId(puzzle);
                return puzzleId && !completed.has(puzzleId);
            });
    }

    function getActivePuzzleIds() {
        return activePuzzles.map(getStablePuzzleId).filter(Boolean);
    }

    function getPuzzleResultKey(puzzle) {
        return getStablePuzzleId(puzzle);
    }

    function toStoredCount(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    }

    function normalizePlayerProfile(rawProfile = {}) {
        const normalized = { ...DEFAULT_PLAYER_PROFILE };
        Object.keys(DEFAULT_PLAYER_PROFILE).forEach((key) => {
            if (key === 'lastPlayedAt') {
                normalized.lastPlayedAt = typeof rawProfile.lastPlayedAt === 'string' ? rawProfile.lastPlayedAt : null;
            } else if (key === 'bossesDefeated') {
                normalized.bossesDefeated = rawProfile.bossesDefeated && typeof rawProfile.bossesDefeated === 'object'
                    ? { ...rawProfile.bossesDefeated }
                    : {};
                if (normalized.bossesDefeated['tactics-goblin'] && !normalized.bossesDefeated['3']) {
                    normalized.bossesDefeated['3'] = true;
                    delete normalized.bossesDefeated['tactics-goblin'];
                }
            } else if (key === 'bossDefeatXp') {
                normalized.bossDefeatXp = rawProfile.bossDefeatXp && typeof rawProfile.bossDefeatXp === 'object'
                    ? { ...rawProfile.bossDefeatXp }
                    : {};
            } else if (key === 'currentBossLevelUnlocked') {
                const unlockedLevel = toStoredCount(rawProfile.currentBossLevelUnlocked);
                normalized.currentBossLevelUnlocked = unlockedLevel > 0 ? unlockedLevel : null;
            } else if (key === 'currentLevelXp') {
                const currentLevelXp = Number(rawProfile.currentLevelXp);
                normalized.currentLevelXp = Number.isFinite(currentLevelXp) && currentLevelXp >= 0
                    ? Math.min(XP_PER_LEVEL - 1, Math.floor(currentLevelXp))
                    : 0;
            } else if (key === 'completedPuzzleIds') {
                normalized.completedPuzzleIds = Array.isArray(rawProfile.completedPuzzleIds)
                    ? Array.from(new Set(rawProfile.completedPuzzleIds.map(id => String(id)).filter(Boolean)))
                    : [];
            } else {
                const fallback = key === 'highestLevelReached' ? 1 : 0;
                normalized[key] = toStoredCount(rawProfile[key], fallback);
            }
        });
        normalized.totalXp = Math.max(normalized.totalXp, getStoredTotalXp());
        if (!Number.isFinite(Number(rawProfile.currentLevelXp))) {
            normalized.currentLevelXp = normalized.totalXp % XP_PER_LEVEL;
        }
        Object.keys(normalized.bossesDefeated).forEach((level) => {
            if (normalized.bossesDefeated[level] && !toStoredCount(normalized.bossDefeatXp[level])) {
                normalized.bossDefeatXp[level] = getBossLevelXpThreshold(Number(level));
            }
        });
        normalized.highestLevelReached = Math.max(1, normalized.highestLevelReached, getLevelFromXp(normalized.totalXp));
        normalized.currentBossLevelUnlocked = getLockedBossLevel(normalized.totalXp, normalized.bossesDefeated, normalized.bossDefeatXp);
        return normalized;
    }

    function loadPlayerProfile() {
        try {
            playerProfile = normalizePlayerProfile(readTrainingJson(PLAYER_PROFILE_KEY, {}));
        } catch (err) {
            playerProfile = normalizePlayerProfile({});
        }
        totalXp = playerProfile.totalXp;
        currentStreak = getStoredStreak(0);
        savePlayerProfile();
    }

    function savePlayerProfile() {
        playerProfile = normalizePlayerProfile(playerProfile);
        totalXp = playerProfile.totalXp;
        playerProfile.currentStreak = currentStreak;
        writeTrainingJson(PLAYER_PROFILE_KEY, playerProfile);
        localStorage.setItem(TOTAL_XP_KEY, String(totalXp));
    }

    function loadTotalXp() {
        loadPlayerProfile();
    }

    function saveTotalXp() {
        totalXp = Math.max(0, Math.floor(Number(totalXp) || 0));
        playerProfile.totalXp = totalXp;
        playerProfile.currentLevelXp = getCurrentLevelXp();
        playerProfile.highestLevelReached = Math.max(playerProfile.highestLevelReached, getLevelFromXp(totalXp));
        playerProfile.currentBossLevelUnlocked = getLockedBossLevel(totalXp, playerProfile.bossesDefeated, playerProfile.bossDefeatXp);
        savePlayerProfile();
    }

    function getLevelFromXp(xp) {
        const normalizedXp = Math.max(0, Math.floor(Number(xp) || 0));
        return Math.max(1, Math.floor(normalizedXp / XP_PER_LEVEL) + 1);
    }

    function getBossLevelXpThreshold(level) {
        return Math.max(0, (Math.max(1, Math.floor(Number(level) || 1)) - 1) * XP_PER_LEVEL);
    }

    function isBossLevel(level) {
        return Number.isFinite(Number(level)) && Number(level) > 0 && Number(level) % 3 === 0;
    }

    function getBossConfigById(id) {
        return BOSS_CATALOG.find(boss => boss.id === id) || BOSS_CATALOG[0];
    }

    function getBossForLevel(level) {
        if (!isBossLevel(level)) return null;
        const milestone = BOSS_MILESTONES.find(boss => boss.level === level);
        const bossIndex = Math.max(0, Math.floor((Number(level) || 3) / 3) - 1);
        const bossConfig = getBossConfigById(milestone ? milestone.bossId : BOSS_CATALOG[bossIndex % BOSS_CATALOG.length].id);
        return { ...bossConfig, level };
    }

    function getModifierById(id) {
        return BOSS_MODIFIERS.find(modifier => modifier.id === id);
    }

    function getModifierCountForLevel(level) {
        const normalizedLevel = Math.max(3, Math.floor(Number(level) || 3));
        if (normalizedLevel < 6) return 2;
        if (normalizedLevel < 12) return 3;
        if (normalizedLevel < 18) return 4;
        return 4 + Math.floor(Math.random() * 2);
    }

    function getWeaknessThemeModifier() {
        const weakness = activePuzzleTheme || (profile && profile.topWeaknesses && profile.topWeaknesses[0]);
        if (!weakness) return null;
        const normalized = String(weakness).toLowerCase();
        if (normalized.includes('fork')) return getModifierById('theme-forks');
        if (normalized.includes('pin')) return getModifierById('theme-pins');
        if (normalized.includes('skewer')) return getModifierById('theme-skewers');
        if (normalized.includes('mate')) return getModifierById('theme-mates');
        if (normalized.includes('endgame') || normalized.includes('rook')) return getModifierById('theme-endgames');
        return { ...getModifierById('theme-weakness'), value: weakness, label: `${titleCaseTheme(weakness)} Focus` };
    }

    function uniqueModifiers(modifiers) {
        const byType = new Map();
        modifiers.filter(Boolean).forEach((modifier) => {
            if (!byType.has(modifier.type)) {
                byType.set(modifier.type, modifier);
            }
        });
        return Array.from(byType.values());
    }

    function pickRandom(items) {
        if (!items.length) return null;
        return items[Math.floor(Math.random() * items.length)];
    }

    function buildBossChallenge(boss) {
        const targetModifierCount = getModifierCountForLevel(boss.level);
        const preferred = (boss.preferredModifiers || []).map(getModifierById).filter(Boolean);
        const weaknessTheme = getWeaknessThemeModifier();
        const selected = DEFAULT_BOSS_MODIFIER_IDS.map(getModifierById).filter(Boolean);

        if (weaknessTheme && Math.random() < 0.45 && targetModifierCount > selected.length) selected.push(weaknessTheme);
        if (preferred.length && targetModifierCount > uniqueModifiers(selected).length) selected.push(pickRandom(preferred));

        while (uniqueModifiers(selected).length < targetModifierCount) {
            const pool = Math.random() < 0.6 && preferred.length ? preferred : BOSS_MODIFIERS;
            selected.push(pickRandom(pool));
            if (selected.length > 20) break;
        }

        const modifiers = uniqueModifiers(selected);
        const livesModifier = modifiers.find(modifier => modifier.type === 'lives') || getModifierById('lives-3');
        const timerModifier = modifiers.find(modifier => modifier.type === 'timer') || null;
        const difficultyModifier = modifiers.find(modifier => modifier.type === 'difficulty') || getModifierById('difficulty-normal');
        const objectiveModifier = modifiers.find(modifier => modifier.type === 'objective') || getModifierById('solve-5');
        const themeModifier = modifiers.find(modifier => modifier.type === 'theme') || getModifierById('theme-tactics');
        const reward = Math.max(0, Math.floor((boss.baseReward || 150) + modifiers.reduce((sum, modifier) => sum + (modifier.rewardBonus || 0), 0)));

        return {
            boss,
            level: boss.level,
            modifiers,
            lives: livesModifier.value,
            timerSeconds: timerModifier ? timerModifier.value : null,
            difficulty: difficultyModifier.value,
            objectiveType: objectiveModifier.objectiveType || 'total',
            requiredCorrect: objectiveModifier.value,
            theme: themeModifier.value === 'weakness'
                ? ((profile && profile.topWeaknesses && profile.topWeaknesses[0]) || 'tacticalAwareness')
                : themeModifier.value,
            objectiveLabel: objectiveModifier.label,
            reward
        };
    }

    function getChallengeRating(baseRating, challenge) {
        const rating = Number(baseRating || 1000);
        if (!challenge) return rating;
        if (challenge.difficulty === 'expert') return Math.min(2600, rating + 350);
        if (challenge.difficulty === 'advanced') return Math.min(2600, rating + 200);
        return rating;
    }

    function isBossDefeated(level, defeatedBosses = playerProfile.bossesDefeated) {
        return Boolean(defeatedBosses && defeatedBosses[String(level)]);
    }

    function getBossDefeatXp(level, defeatXpMap = playerProfile.bossDefeatXp) {
        return toStoredCount(defeatXpMap && defeatXpMap[String(level)], getBossLevelXpThreshold(level));
    }

    function getLockedBossLevel(xp = totalXp, defeatedBosses = playerProfile.bossesDefeated, defeatXpMap = playerProfile.bossDefeatXp) {
        const normalizedXp = Math.max(0, Math.floor(Number(xp) || 0));
        for (let level = 3; level <= getLevelFromXp(normalizedXp) + 3; level += 3) {
            if (isBossDefeated(level, defeatedBosses)) continue;
            if (level === 3) {
                return normalizedXp >= getBossLevelXpThreshold(level) ? level : null;
            }

            const previousBossLevel = level - 3;
            if (!isBossDefeated(previousBossLevel, defeatedBosses)) return null;
            const previousDefeatXp = getBossDefeatXp(previousBossLevel, defeatXpMap);
            const xpNeededAfterPreviousBoss = (level - previousBossLevel - 1) * XP_PER_LEVEL;
            return normalizedXp >= previousDefeatXp + xpNeededAfterPreviousBoss ? level : null;
        }
        return null;
    }

    function getDisplayedLevelFromXp(xp = totalXp) {
        const lockedBossLevel = getLockedBossLevel(xp);
        if (lockedBossLevel) return lockedBossLevel;

        const defeatedBossLevels = Object.keys(playerProfile.bossesDefeated || {})
            .map(level => Number(level))
            .filter(level => isBossLevel(level) && isBossDefeated(level))
            .sort((a, b) => a - b);
        const latestDefeatedBossLevel = defeatedBossLevels[defeatedBossLevels.length - 1];
        if (!latestDefeatedBossLevel) return getLevelFromXp(xp);

        const defeatXp = getBossDefeatXp(latestDefeatedBossLevel);
        const xpAfterBoss = Math.max(0, Math.floor(Number(xp) || 0) - defeatXp);
        const nextBossLevel = latestDefeatedBossLevel + 3;
        const segmentLevel = latestDefeatedBossLevel + 1 + Math.floor(xpAfterBoss / XP_PER_LEVEL);
        return Math.min(getLevelFromXp(xp), nextBossLevel - 1, segmentLevel);
    }

    function getCurrentTrainingLevel() {
        return Math.max(1, Math.floor(Number(getDisplayedLevelFromXp(totalXp)) || 1));
    }

    function getDifficultyRangeForLevel(level, options = {}) {
        const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
        const bands = [
            { minLevel: 1, maxLevel: 3, minRating: 400, maxRating: 750, label: 'very easy' },
            { minLevel: 4, maxLevel: 7, minRating: 550, maxRating: 950, label: 'easy' },
            { minLevel: 8, maxLevel: 12, minRating: 750, maxRating: 1300, label: 'medium' },
            { minLevel: 13, maxLevel: 20, minRating: 1000, maxRating: 1750, label: 'harder' },
            { minLevel: 21, maxLevel: Infinity, minRating: 1350, maxRating: 2400, label: 'advanced' }
        ];
        const band = bands.find(item => normalizedLevel >= item.minLevel && normalizedLevel <= item.maxLevel) || bands[bands.length - 1];
        const span = band.maxRating - band.minRating;
        const position = Number.isFinite(band.maxLevel)
            ? (normalizedLevel - band.minLevel) / Math.max(1, band.maxLevel - band.minLevel + 1)
            : Math.min(1, (normalizedLevel - band.minLevel) / 24);
        const lift = Math.round(span * 0.22 * Math.max(0, Math.min(1, position)));
        let min = Math.max(400, Math.min(2600, band.minRating + lift));
        let max = Math.max(400, Math.min(2600, band.maxRating + lift));
        if (options.boss === true) {
            const width = Math.max(120, max - min);
            min = Math.max(400, Math.min(2600, max - Math.round(width * 0.45)));
            max = Math.max(400, Math.min(2600, max + 150));
        }
        return {
            level: normalizedLevel,
            min,
            max,
            target: Math.round(min + (max - min) * (options.boss === true ? 0.75 : 0.5)),
            label: options.boss === true ? `${band.label} boss` : band.label,
            boss: options.boss === true
        };
    }

    function getCurrentLevelXp() {
        return Math.max(0, Math.min(XP_PER_LEVEL - 1, Math.floor(Number(playerProfile.currentLevelXp) || 0)));
    }

    function getXpProgress() {
        return getCurrentLevelXp();
    }

    function getXpForNextLevel() {
        return XP_PER_LEVEL;
    }

    function getChapterName() {
        const weakness = activePuzzleTheme || (profile && profile.topWeaknesses && profile.topWeaknesses[0]);
        if (weakness && WEAKNESS_CHAPTERS[weakness]) return WEAKNESS_CHAPTERS[weakness];
        if (weakness) return titleCaseTheme(weakness);
        const chapterIndex = Math.floor(Math.max(0, getDisplayedLevelFromXp(totalXp) - 1) / 2) % CHAPTER_SEQUENCE.length;
        return CHAPTER_SEQUENCE[chapterIndex];
    }

    function getBossMilestone(level) {
        const boss = getBossForLevel(level);
        return boss ? { level, name: boss.name } : { level, name: BOSS_CATALOG[0].name };
    }

    function getNextBossMilestone(currentLevel) {
        const lockedBossLevel = getLockedBossLevel(totalXp);
        if (lockedBossLevel) return getBossMilestone(lockedBossLevel);
        const nextBossLevel = Math.max(3, Math.ceil((currentLevel + 1) / 3) * 3);
        return getBossMilestone(nextBossLevel);
    }

    function getNodeState(level, currentLevel, lockedBossLevel) {
        if (level === currentLevel) return 'current';
        if (isBossLevel(level)) {
            return isBossDefeated(level) ? 'completed' : 'locked';
        }
        if (level < currentLevel) return 'completed';
        if (!lockedBossLevel && level === currentLevel + 1) return 'unlocked';
        return 'locked';
    }

    function buildProgressionNodes(currentLevel, nextBoss, lockedBossLevel) {
        const levels = new Set();
        for (let level = Math.max(1, currentLevel - 3); level <= currentLevel + 3; level++) {
            levels.add(level);
        }
        if (nextBoss && nextBoss.level <= currentLevel + 4) levels.add(nextBoss.level);

        return Array.from(levels)
            .sort((a, b) => b - a)
            .slice(0, 8)
            .map((level, index) => {
                const boss = isBossLevel(level) ? getBossMilestone(level) : null;
                const state = getNodeState(level, currentLevel, lockedBossLevel);
                return {
                    level,
                    state,
                    type: boss ? 'boss' : 'level',
                    pathSlot: index % 4,
                    label: boss ? `Level ${level} Boss` : `Level ${level}`,
                    bossName: boss ? boss.name : '',
                    icon: boss ? '♛' : (state === 'completed' ? '✓' : String(level))
                };
            });
    }

    function getLevelTitle(level) {
        const index = Math.max(0, Number(level || 1) - 1) % CHAPTER_SEQUENCE.length;
        return CHAPTER_SEQUENCE[index] || 'Tactical Vision';
    }

    function getLevelDescription(level, state) {
        if (state === 'next') return 'Solve to unlock the next challenge.';
        if (state === 'previous') return 'Completed tactical training milestone.';
        const theme = activePuzzleTheme || (profile && profile.topWeaknesses && profile.topWeaknesses[0]);
        if (theme && WEAKNESS_CHAPTERS[theme]) return `Improve your ${titleCaseTheme(theme)} patterns.`;
        return 'Find the best move in tactical positions.';
    }

    function getProfileAvatarPiece() {
        const piece = localStorage.getItem('chess_profile_avatar_piece');
        return piece && piece.trim() ? piece.trim() : '♜';
    }

    function ThreeLevelRow({ state, eyebrow, icon, level, title, description, meta, progress, progressPercent }) {
        const progressMarkup = state === 'current'
            ? `
                <div class="level-card-progress">
                    <div class="level-card-progress-row">
                        <span class="xp-star" aria-hidden="true">✹</span>
                        <strong>${progress}/${XP_PER_LEVEL} XP</strong>
                    </div>
                    <div class="level-card-progress-track" aria-label="Current level XP progress ${progressPercent}%">
                        <span style="width: ${progressPercent}%"></span>
                    </div>
                </div>
            `
            : `<div class="level-card-meta"><span class="xp-star" aria-hidden="true">✹</span>${meta}</div>`;

        return `
            <div class="level-path-row ${state}">
                <div class="level-path-rail" aria-hidden="true">
                    <span class="level-path-icon">${icon}</span>
                </div>
                <div class="level-card-content">
                    <div class="level-card-label">${eyebrow}</div>
                    <div class="level-card ${state}">
                        <div class="level-number">${level}</div>
                        <div class="level-copy">
                            <strong>${title}</strong>
                            <span>${description}</span>
                            ${progressMarkup}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderProgressionViewer() {
        if (!els.xp) return;
        if (isBossBattleActive && activeBoss) {
            renderBossInfoPanel();
            return;
        }
        els.xp.classList.remove('is-boss-info-panel');
        const lockedBossLevel = getLockedBossLevel(totalXp);
        const currentLevel = lockedBossLevel || getDisplayedLevelFromXp(totalXp);
        const progress = lockedBossLevel ? 0 : getXpProgress();
        const progressPercent = Math.max(0, Math.min(100, Math.round((progress / XP_PER_LEVEL) * 100)));
        const previousLevel = Math.max(1, currentLevel - 1);
        const nextLevel = currentLevel + 1;
        const xpNeeded = lockedBossLevel ? 'Boss challenge required' : `${XP_PER_LEVEL - progress} XP`;

        els.xp.innerHTML = `
            <div class="progression-viewer level-map-shell three-level-map" aria-label="Puzzle level progression">
                ${ThreeLevelRow({
                    state: 'next',
                    eyebrow: 'NEXT LEVEL',
                    icon: '🔒',
                    level: nextLevel,
                    title: getLevelTitle(nextLevel),
                    description: 'Solve to unlock',
                    meta: xpNeeded
                })}
                ${ThreeLevelRow({
                    state: 'current',
                    eyebrow: 'CURRENT LEVEL',
                    icon: getProfileAvatarPiece(),
                    level: currentLevel,
                    title: getChapterName() || getLevelTitle(currentLevel),
                    description: getLevelDescription(currentLevel, 'current'),
                    progress,
                    progressPercent
                })}
                ${ThreeLevelRow({
                    state: 'previous',
                    eyebrow: 'PREVIOUS LEVEL',
                    icon: '✓',
                    level: previousLevel,
                    title: getLevelTitle(previousLevel),
                    description: getLevelDescription(previousLevel, 'previous'),
                    meta: `${Math.min(totalXp, previousLevel * XP_PER_LEVEL).toLocaleString()} XP`
                })}
                <div class="level-map-footer">
                    <span aria-hidden="true">🏆</span>
                    <strong>Keep solving to level up!</strong>
                    <small>${Math.max(0, currentLevel - 1)} levels completed</small>
                </div>
            </div>
        `;
        els.xp.title = `Level ${currentLevel} | Session XP: ${sessionXp} | Total XP: ${totalXp}`;
    }

    function renderBossInfoPanel() {
        if (!els.xp || !activeBoss) return;
        els.xp.classList.add('is-boss-info-panel');
        const hpLimit = activeBossChallenge ? activeBossChallenge.lives : bossPlayerHp;
        const stateText = bossWon ? 'Victory' : (bossLost ? 'Defeat' : `${bossCorrectCount}/${bossRequiredCorrect}`);
        const timerText = activeBossChallenge && activeBossChallenge.timerSeconds
            ? `<span><small>Time</small><strong>${bossTimerRemaining === null ? activeBossChallenge.timerSeconds : bossTimerRemaining}s</strong></span>`
            : '';
        const modifiers = activeBossChallenge
            ? activeBossChallenge.modifiers.map(modifier => `<li title="${modifier.description}">${modifier.label}</li>`).join('')
            : '';

        els.xp.title = `${activeBoss.name} | Level ${bossLevel} Boss`;
        els.xp.innerHTML = `
            <div class="boss-info-panel" aria-label="Active boss fight">
                <div class="boss-battle-heading">
                    <span class="boss-icon">${activeBoss.icon || '♛'}</span>
                    <div>
                        <strong>${bossName}</strong>
                        <small>Level ${bossLevel} Boss Fight</small>
                    </div>
                </div>
                <div class="boss-rule-grid">
                    <span><small>Lives</small><strong>${bossPlayerHp}/${hpLimit}</strong></span>
                    <span><small>Progress</small><strong>${stateText}</strong></span>
                    ${timerText}
                    <span><small>Reward</small><strong>${activeBossChallenge ? activeBossChallenge.reward : 0} XP</strong></span>
                </div>
                <div class="boss-objective">${activeBossChallenge ? activeBossChallenge.objectiveLabel : 'Defeat the boss'}</div>
                <ul class="boss-modifier-list">${modifiers}</ul>
            </div>
        `;
    }

    function createRewardParticle(index, isBossReward = false) {
        const particle = document.createElement('span');
        particle.className = `reward-particle${isBossReward ? ' is-boss' : ''}`;
        const angle = (Math.PI * 2 * index) / 18;
        const distance = 68 + (index % 4) * 18;
        const x = Math.round(Math.cos(angle) * distance);
        const y = Math.round(Math.sin(angle) * distance);
        particle.style.setProperty('--particle-x', `${x}px`);
        particle.style.setProperty('--particle-y', `${y}px`);
        particle.style.animationDelay = `${(index % 6) * 35}ms`;
        return particle;
    }

    function showRewardOverlay({ xpEarned = 0, didLevelComplete = false, didDefeatBoss = false, newLevel = null, rewardKey = '', onAnimationComplete } = {}) {
        const normalizedXp = Math.max(0, Math.floor(Number(xpEarned) || 0));
        if (!normalizedXp && !didLevelComplete && !didDefeatBoss) return;
        if (rewardKey) {
            if (rewardAnimationKeys.has(rewardKey)) return;
            rewardAnimationKeys.add(rewardKey);
        }

        const overlay = document.createElement('div');
        overlay.className = [
            'reward-overlay',
            didLevelComplete ? 'is-level-complete' : '',
            didDefeatBoss ? 'is-boss-defeated' : ''
        ].filter(Boolean).join(' ');
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');

        const particleCount = didDefeatBoss ? 36 : (didLevelComplete ? 28 : 18);
        const particles = document.createElement('div');
        particles.className = 'reward-particles';
        for (let index = 0; index < particleCount; index++) {
            particles.appendChild(createRewardParticle(index, didDefeatBoss));
        }

        const card = document.createElement('div');
        card.className = 'reward-card';
        const title = didDefeatBoss
            ? 'Boss Defeated!'
            : (didLevelComplete ? 'Level Complete!' : 'Puzzle Solved!');
        const subtitle = didDefeatBoss
            ? 'Victory bonus secured'
            : (didLevelComplete && newLevel ? `Level ${newLevel} Unlocked` : 'Nice tactic');
        card.innerHTML = `
            <div class="reward-burst" aria-hidden="true">${didDefeatBoss ? '♛' : (didLevelComplete ? '★' : '✦')}</div>
            <div class="reward-title">${title}</div>
            <div class="reward-xp">+${normalizedXp} XP</div>
            <div class="reward-subtitle">${subtitle}</div>
        `;

        overlay.appendChild(particles);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        if (didDefeatBoss) {
            document.body.classList.add('reward-screen-shake');
            setTimeout(() => document.body.classList.remove('reward-screen-shake'), 620);
        }

        const lifetime = didDefeatBoss ? 2200 : (didLevelComplete ? 1900 : 1350);
        setTimeout(() => {
            overlay.classList.add('is-fading');
            setTimeout(() => {
                overlay.remove();
                if (typeof onAnimationComplete === 'function') onAnimationComplete();
            }, 360);
        }, lifetime);
    }

    function getPuzzleXpAward(isCorrectFirstTry) {
        if (!isCorrectFirstTry) return 0;
        return XP_PER_CORRECT_PUZZLE + (currentStreak >= XP_STREAK_BONUS_THRESHOLD ? XP_STREAK_BONUS : 0);
    }

    function awardPuzzleXp(isCorrectFirstTry) {
        const earnedXp = getPuzzleXpAward(isCorrectFirstTry);
        if (earnedXp <= 0) return 0;
        const currentLevelXp = getCurrentLevelXp();
        const didCompleteLevel = currentLevelXp + earnedXp >= XP_PER_LEVEL;
        sessionXp = Math.max(0, sessionXp + earnedXp);
        totalXp = Math.max(0, totalXp + earnedXp);
        playerProfile.currentLevelXp = didCompleteLevel ? 0 : currentLevelXp + earnedXp;
        saveTotalXp();
        return earnedXp;
    }

    function awardBonusXp(amount) {
        const earnedXp = Math.max(0, Math.floor(Number(amount) || 0));
        if (earnedXp <= 0) return 0;
        const currentLevelXp = getCurrentLevelXp();
        const didCompleteLevel = currentLevelXp + earnedXp >= XP_PER_LEVEL;
        sessionXp = Math.max(0, sessionXp + earnedXp);
        totalXp = Math.max(0, totalXp + earnedXp);
        playerProfile.currentLevelXp = didCompleteLevel ? 0 : currentLevelXp + earnedXp;
        saveTotalXp();
        return earnedXp;
    }

    function recordPuzzleProfileResult(isCorrectFirstTry, isSolved = true) {
        playerProfile.totalPuzzlesAttempted++;
        if (isSolved) {
            playerProfile.totalPuzzlesSolved++;
        }
        if (isCorrectFirstTry) {
            playerProfile.totalCorrect++;
        } else {
            playerProfile.totalIncorrect++;
        }
        playerProfile.bestOverallStreak = Math.max(playerProfile.bestOverallStreak, bestSessionStreak);
        playerProfile.highestLevelReached = Math.max(playerProfile.highestLevelReached, getLevelFromXp(totalXp));
        playerProfile.lastPlayedAt = new Date().toISOString();
        savePlayerProfile();
    }

    function recordSessionProfileSummary(reason) {
        if (sessionSummaryRecorded) return;
        sessionSummaryRecorded = true;
        playerProfile.totalSessionsPlayed++;
        if (reason === 'hp' || reason === 'boss-loss') {
            playerProfile.totalGameOvers++;
        }
        playerProfile.bestOverallStreak = Math.max(playerProfile.bestOverallStreak, bestSessionStreak);
        playerProfile.highestLevelReached = Math.max(playerProfile.highestLevelReached, getLevelFromXp(totalXp));
        playerProfile.lastPlayedAt = new Date().toISOString();
        savePlayerProfile();
    }

    function recordBossWin() {
        if (!activeBoss || !activeBossLevel || isBossDefeated(activeBossLevel)) return;
        playerProfile.bossWins++;
        playerProfile.bossesDefeated[String(activeBossLevel)] = true;
        playerProfile.bossDefeatXp[String(activeBossLevel)] = Math.max(0, Math.floor(Number(totalXp) || 0));
        playerProfile.currentBossLevelUnlocked = getLockedBossLevel(totalXp, playerProfile.bossesDefeated, playerProfile.bossDefeatXp);
        playerProfile.highestLevelReached = Math.max(playerProfile.highestLevelReached, getLevelFromXp(totalXp));
        playerProfile.lastPlayedAt = new Date().toISOString();
        recordActivity({
            type: 'boss-defeated',
            icon: activeBoss.icon || '♛',
            title: `Defeated ${activeBoss.name}`,
            detail: `Level ${activeBossLevel} boss cleared`,
            xp: bossBonusXp > 0 ? `+${bossBonusXp} XP` : '',
            accent: 'purple'
        });
        savePlayerProfile();
    }

    function stopBossTimer() {
        if (bossTimerId) {
            clearInterval(bossTimerId);
            bossTimerId = null;
        }
    }

    function startBossTimer() {
        stopBossTimer();
        if (!isBossBattleActive || !activeBossChallenge || !activeBossChallenge.timerSeconds) return;
        const currentPuzzle = activePuzzles[activePuzzleIndex];
        const resultKey = getPuzzleResultKey(currentPuzzle);
        if (!resultKey || puzzleSetResults.has(resultKey)) return;
        bossTimerSeconds = activeBossChallenge.timerSeconds;
        bossTimerRemaining = bossTimerSeconds;
        updatePuzzleStatus();
        bossTimerId = setInterval(() => {
            bossTimerRemaining = Math.max(0, bossTimerRemaining - 1);
            updatePuzzleStatus();
            if (bossTimerRemaining <= 0) {
                stopBossTimer();
                failCurrentBossPuzzle('Time expired. You lost a life.');
            }
        }, 1000);
    }

    function clearBossBattleState() {
        stopBossTimer();
        isBossBattleActive = false;
        sessionMode = NORMAL_MODE;
        activeBoss = null;
        activeBossLevel = null;
        activeBossChallenge = null;
        bossLevel = null;
        bossName = '';
        bossRequiredCorrect = 0;
        bossCorrectCount = 0;
        bossPlayerHp = 0;
        bossWon = false;
        bossLost = false;
        bossTimerSeconds = null;
        bossTimerRemaining = null;
    }

    function finishBossBattleWin() {
        bossWon = true;
        bossBonusXp = isBossDefeated(activeBossLevel) ? 0 : awardBonusXp(activeBossChallenge ? activeBossChallenge.reward : activeBoss.baseReward);
        recordBossWin();
        if (pendingPuzzleReward) {
            const newLevel = getDisplayedLevelFromXp(totalXp);
            const didLevelComplete = newLevel > pendingPuzzleReward.previousLevel;
            showRewardOverlay({
                xpEarned: pendingPuzzleReward.xpEarned + bossBonusXp,
                didLevelComplete,
                didDefeatBoss: true,
                newLevel,
                rewardKey: `${pendingPuzzleReward.rewardKey}:boss`
            });
            pendingPuzzleReward = null;
        }
        setFeedback(`${activeBoss.name} defeated! Boss bonus: ${bossBonusXp} XP.`, 'success');
        updatePuzzleStatus();
        showPuzzleSessionSummary('boss-win');
    }

    function failCurrentBossPuzzle(message) {
        if (!isBossBattleActive || !activeBoss || sessionEndedBy !== 'active') return;
        const puzzle = activePuzzles[activePuzzleIndex];
        const resultKey = getPuzzleResultKey(puzzle);
        if (!resultKey || puzzleSetResults.has(resultKey)) return;

        if (!currentPuzzleHadMistake) {
            setStoredStreak(0);
            bossPlayerHp = Math.max(0, bossPlayerHp - 1);
            currentHp = bossPlayerHp;
            if (activeBossChallenge && activeBossChallenge.objectiveType === 'consecutive') {
                bossCorrectCount = 0;
            }
        }
        currentPuzzleHadMistake = true;
        puzzleSetResults.set(resultKey, false);
        recordPuzzleProfileResult(false, false);

        if (bossPlayerHp <= 0) {
            bossLost = true;
            setFeedback(`${activeBoss.name} wins. ${message}`, 'error');
            updatePuzzleStatus();
            showPuzzleSessionSummary('boss-loss');
            return;
        }

        setFeedback(`${message} Boss Progress: ${bossCorrectCount}/${bossRequiredCorrect}`, 'error');
        updatePuzzleStatus();
    }

    function handleBossPuzzleSolved() {
        if (!isBossBattleActive || !activeBoss || sessionEndedBy !== 'active') return false;
        stopBossTimer();
        bossCorrectCount = activeBossChallenge && activeBossChallenge.objectiveType === 'consecutive'
            ? bossCorrectCount + 1
            : bossCorrectCount + 1;
        bossCorrect = bossCorrectCount;
        if (bossCorrectCount >= bossRequiredCorrect) {
            finishBossBattleWin();
            return true;
        }
        setFeedback(`Hit landed on ${activeBoss.name}. Boss Progress: ${bossCorrectCount}/${bossRequiredCorrect}`, 'success');
        return false;
    }

    function renderHpMeter() {
        if (!els.hp) return;
        const hpLimit = activeBossChallenge ? activeBossChallenge.lives : maxHp;
        const label = `HP: ${currentHp}/${hpLimit}`;
        const hearts = Array.from({ length: hpLimit }, (_, index) => index < currentHp ? '❤️' : '♡').join('');
        els.hp.setAttribute('aria-label', label);
        els.hp.innerHTML = `
            <span class="stat-card-label" aria-hidden="true">HP</span>
            <span class="stat-card-value hp-hearts" aria-hidden="true">${hearts}</span>
            <span class="visually-hidden">${label}</span>
        `;
    }

    function updateBossStatus() {
        if (!els.bossStatus) return;
        const isBossMode = isBossBattleActive && activeBoss;
        const lockedBossLevel = getLockedBossLevel(totalXp);
        const lockedBoss = lockedBossLevel ? getBossForLevel(lockedBossLevel) : null;
        els.bossStatus.hidden = isBossMode || !lockedBoss;
        if (isBossMode) {
            els.bossStatus.classList.remove('is-active-boss');
            els.bossStatus.removeAttribute('role');
            els.bossStatus.removeAttribute('tabindex');
            els.bossStatus.innerHTML = '';
        } else if (lockedBoss) {
            els.bossStatus.classList.remove('is-active-boss');
            els.bossStatus.setAttribute('role', 'button');
            els.bossStatus.setAttribute('tabindex', '0');
            els.bossStatus.innerHTML = `
                <div class="boss-battle-heading">
                    <span class="boss-icon">${lockedBoss.icon || '♛'}</span>
                    <div>
                        <strong>Boss Battle Unlocked: ${lockedBoss.name}</strong>
                        <small>Level ${lockedBossLevel} Boss Battle Required</small>
                    </div>
                </div>
                <div class="boss-objective">Click to generate a randomized challenge.</div>
            `;
        } else {
            els.bossStatus.classList.remove('is-active-boss');
            els.bossStatus.removeAttribute('role');
            els.bossStatus.removeAttribute('tabindex');
            els.bossStatus.innerHTML = '';
        }
    }

    function updatePuzzleStatus() {
        const hasPuzzle = activePuzzleIndex >= 0 && puzzleGame;
        const side = hasPuzzle && puzzleGame.turn() === 'w' ? 'White' : 'Black';
        const solverSide = puzzleSolverSide === 'white' ? 'White' : 'Black';
        const solvedMoves = Math.max(0, solutionIndex - puzzleInteractiveStartIndex);
        const totalSolverLineMoves = Math.max(0, solutionMoves.length - puzzleInteractiveStartIndex);
        const currentPuzzle = activePuzzles[activePuzzleIndex];
        const currentPuzzleKey = getPuzzleResultKey(currentPuzzle);
        const currentPuzzleFinished = currentPuzzleKey && puzzleSetResults.has(currentPuzzleKey);
        const completedCount = puzzleSetResults.size;
        const correctCount = Array.from(puzzleSetResults.values()).filter(Boolean).length;
        const accuracy = completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : null;
        const puzzlesLeft = Math.max(0, activePuzzles.length - completedCount);
        const isFullscreen = Boolean(els.boardFullscreenTarget && els.boardFullscreenTarget.classList.contains('is-fullscreen-puzzle'));
        const sessionEnded = sessionEndedBy !== 'active';

        updatePuzzleGoalCard(hasPuzzle ? currentPuzzle : null);
        if (els.sideToMove) {
            els.sideToMove.innerText = hasPuzzle
                ? (isFullscreen ? `${side} to move` : `You are solving as ${solverSide} | Side to move: ${side}`)
                : 'Side to move: -';
        }
        if (els.moveProgress) {
            els.moveProgress.innerText = isFullscreen
                ? `Move ${solvedMoves}/${totalSolverLineMoves}`
                : `Move ${solvedMoves} / ${totalSolverLineMoves}`;
        }
        if (els.puzzleAccuracy) {
            els.puzzleAccuracy.innerText = accuracy === null
                ? (isFullscreen ? 'Accuracy -' : 'Puzzle Accuracy: -')
                : (isFullscreen ? `Accuracy ${accuracy}%` : `Puzzle Accuracy: ${accuracy}% (${correctCount}/${completedCount})`);
        }
        if (els.currentStreak) {
            els.currentStreak.innerText = isFullscreen
                ? `Streak ${currentStreak}`
                : `Current Streak: ${currentStreak}`;
        }
        renderHpMeter();
        updateBossStatus();
        if (els.sessionXp) {
            els.sessionXp.innerHTML = `<span class="stat-card-label">Session XP</span><span class="stat-card-value"><span aria-hidden="true">⭐</span> ${sessionXp}</span>`;
            els.sessionXp.title = `Total XP: ${totalXp}`;
        }
        renderProgressionViewer();
        if (els.streakCallout) {
            els.streakCallout.innerHTML = `<span class="stat-card-label">Current Streak</span><span class="stat-card-value"><span aria-hidden="true">🔥</span> ${currentStreak}</span>`;
        }
        if (els.puzzlesLeft) {
            els.puzzlesLeft.innerText = `Puzzles left: ${puzzlesLeft}`;
        }
        if (els.prevPuzzle) els.prevPuzzle.disabled = sessionEnded || activePuzzles.length === 0 || (hasPuzzle && !currentPuzzleFinished);
        if (els.nextPuzzle) els.nextPuzzle.disabled = sessionEnded || activePuzzles.length === 0 || (hasPuzzle && !currentPuzzleFinished);
        if (els.prevMove) els.prevMove.disabled = sessionEnded || !hasPuzzle || solutionIndex <= puzzleInteractiveStartIndex;
        if (els.nextMove) els.nextMove.disabled = sessionEnded || !hasPuzzle || !currentPuzzleFinished || solutionIndex >= solutionMoves.length;
    }

    function resizePuzzleBoardSoon() {
        if (!puzzleBoard) return;
        setTimeout(() => puzzleBoard.resize(), 50);
        setTimeout(() => puzzleBoard.resize(), 250);
    }

    function updateFullscreenButton() {
        if (!els.fullscreenBoard) return;
        const isFullscreen = Boolean(els.boardFullscreenTarget && els.boardFullscreenTarget.classList.contains('is-fullscreen-puzzle'));
        els.fullscreenBoard.innerText = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Board';
        els.fullscreenBoard.setAttribute('aria-pressed', String(isFullscreen));
        if (els.boardFullscreenTarget) {
            els.boardFullscreenTarget.classList.toggle('is-fullscreen-puzzle', isFullscreen);
        }
        if (els.prevMove) els.prevMove.innerText = isFullscreen ? '←' : '← Back';
        if (els.nextMove) els.nextMove.innerText = isFullscreen ? '→' : '→ Forward';
        document.body.classList.toggle('training-puzzle-fullscreen-active', isFullscreen);
    }

    function togglePuzzleBoardFullscreen() {
        if (!els.boardFullscreenTarget) return;

        els.boardFullscreenTarget.classList.toggle('is-fullscreen-puzzle');
        updateFullscreenButton();
        updatePuzzleStatus();
        resizePuzzleBoardSoon();
    }

    function renderLogs(logs) {
        if (!els.logs) return;
        els.logs.innerText = (logs || []).join('\n');
    }

    function renderProfile(nextProfile) {
        profile = nextProfile || {};
        const activeAccountProfile = getActiveAccountProfile() || {};
        const profileGamesAnalyzed = Math.max(0, Math.floor(Number(profile.gamesAnalyzed || activeAccountProfile.gamesAnalyzed || 0) || 0));
        const profileEstimatedRating = Math.max(0, Math.floor(Number(
            profile.estimatedRating
            || profile.estimatedPuzzleRating
            || activeAccountProfile.estimatedRating
            || 0
        ) || 0));
        const username = getChessComUsername();
        
        // Render user badge / info
        const usernameText = document.getElementById('profileUsernameText');
        const startAnalysisBtn = document.getElementById('btnStartSkillAnalysis');
        const generalTrainingBtn = document.getElementById('btnStartGeneralTraining');
        
        if (username) {
            if (usernameText) usernameText.innerText = `Detected User: ${username}`;
            if (startAnalysisBtn) {
                startAnalysisBtn.disabled = false;
                startAnalysisBtn.innerText = savedWeaknessProfile ? 'Reanalyze Games' : 'Analyze My Games';
            }
        } else {
            if (usernameText) usernameText.innerText = 'No Synced Games Found';
            if (startAnalysisBtn) {
                startAnalysisBtn.disabled = true;
                startAnalysisBtn.innerText = 'Sync Games to Analyze';
            }
        }
        if (els.analyze) {
            els.analyze.innerText = savedWeaknessProfile ? 'Reanalyze Games' : 'Analyze Recent Games';
        }
        if (generalTrainingBtn) {
            generalTrainingBtn.style.display = 'inline-flex';
        }

        // Check if we have a valid calculated profile
        const dashboard = document.getElementById('skillProfileDashboard');
        const initialState = document.getElementById('skillProfileInitialState');

        if (profile && profileGamesAnalyzed > 0 && profile.averageCentipawnLoss !== undefined) {
            // Show dashboard, hide initial state
            if (dashboard) dashboard.style.display = 'flex';
            if (initialState) initialState.style.display = 'none';

            // Fill dashboard values
            document.getElementById('statGamesCount').innerText = profileGamesAnalyzed;
            document.getElementById('statAvgCpl').innerText = profile.averageCentipawnLoss;
            const puzzleRatingStat = document.getElementById('statPuzzleRating');
            if (puzzleRatingStat) {
                puzzleRatingStat.innerText = profileEstimatedRating || '-';
            }

            // Update CPL Indicator bar and label
            const cplBar = document.getElementById('cplIndicatorBar');
            const cplTier = document.getElementById('cplTierLabel');
            if (cplBar && cplTier) {
                const percent = Math.min(100, (profile.averageCentipawnLoss / 120) * 100);
                cplBar.style.width = `${percent}%`;
                
                if (profile.averageCentipawnLoss <= 25) {
                    cplTier.innerText = 'Grandmaster level accuracy';
                    cplTier.style.color = 'var(--success-color)';
                    cplBar.style.background = 'var(--success-color)';
                } else if (profile.averageCentipawnLoss <= 50) {
                    cplTier.innerText = 'Excellent / Master level';
                    cplTier.style.color = '#60a5fa';
                    cplBar.style.background = '#60a5fa';
                } else if (profile.averageCentipawnLoss <= 80) {
                    cplTier.innerText = 'Good / Club player';
                    cplTier.style.color = '#fbbf24';
                    cplBar.style.background = '#fbbf24';
                } else {
                    cplTier.innerText = 'Needs improvement';
                    cplTier.style.color = 'var(--error-color)';
                    cplBar.style.background = 'var(--error-color)';
                }
            }

            // Accuracy metrics
            document.getElementById('metricBlunderRate').innerText = `${Math.round(profile.blunderRate * 1000) / 10}%`;
            document.getElementById('metricMistakeRate').innerText = `${Math.round(profile.mistakeRate * 1000) / 10}%`;
            document.getElementById('metricInaccuracyRate').innerText = `${Math.round(profile.inaccuracyRate * 1000) / 10}%`;

            // Accuracy donut chart
            const donutChart = document.getElementById('accuracyDonutChart');
            const donutCenterPct = document.getElementById('donutCenterPct');
            
            const mc = profile.moveClassification || { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
            const total = (mc.best || 0) + (mc.good || 0) + (mc.inaccuracy || 0) + (mc.mistake || 0) + (mc.blunder || 0);

            if (donutChart && donutCenterPct) {
                const bestPct = total > 0 ? (mc.best / total) * 100 : 0;
                const goodPct = total > 0 ? (mc.good / total) * 100 : 0;
                const inaccuracyPct = total > 0 ? (mc.inaccuracy / total) * 100 : 0;
                const mistakePct = total > 0 ? (mc.mistake / total) * 100 : 0;
                const blunderPct = total > 0 ? (mc.blunder / total) * 100 : 0;

                donutChart.style.setProperty('--best', `${bestPct}%`);
                donutChart.style.setProperty('--good', `${goodPct}%`);
                donutChart.style.setProperty('--inaccuracy', `${inaccuracyPct}%`);
                donutChart.style.setProperty('--mistake', `${mistakePct}%`);
                donutChart.style.setProperty('--blunder', `${blunderPct}%`);

                const accuracyScore = total > 0 
                    ? Math.round(((mc.best * 100) + (mc.good * 80) + (mc.inaccuracy * 40) + (mc.mistake * 10)) / total)
                    : 0;
                donutCenterPct.innerText = `${accuracyScore}%`;

                // Fill legend values
                document.getElementById('legendBestVal').innerText = mc.best || 0;
                document.getElementById('legendGoodVal').innerText = mc.good || 0;
                document.getElementById('legendInaccuracyVal').innerText = mc.inaccuracy || 0;
                document.getElementById('legendMistakeVal').innerText = mc.mistake || 0;
                document.getElementById('legendBlunderVal').innerText = mc.blunder || 0;
            }

            // Phase Performance bars
            const ps = profile.phaseStats || { opening: { avgCpl: 0 }, middlegame: { avgCpl: 0 }, endgame: { avgCpl: 0 } };
            
            const fillPhaseBar = (phaseId, valId, stat) => {
                const bar = document.getElementById(phaseId);
                const label = document.getElementById(valId);
                if (bar && label) {
                    label.innerText = `${stat.avgCpl} CPL`;
                    const pct = Math.min(100, (stat.avgCpl / 120) * 100);
                    bar.style.width = `${pct}%`;
                }
            };
            fillPhaseBar('phaseOpeningBar', 'phaseOpeningVal', ps.opening || { avgCpl: 0 });
            fillPhaseBar('phaseMiddlegameBar', 'phaseMiddlegameVal', ps.middlegame || { avgCpl: 0 });
            fillPhaseBar('phaseEndgameBar', 'phaseEndgameVal', ps.endgame || { avgCpl: 0 });

            // Color performance split
            const cp = profile.colorPerformance || { white: { avgCpl: 0, blunderRate: 0 }, black: { avgCpl: 0, blunderRate: 0 } };
            const setSplit = (prefix, data) => {
                const cplEl = document.getElementById(`${prefix}Cpl`);
                const statsEl = document.getElementById(`${prefix}Stats`);
                if (cplEl) cplEl.innerText = `${data.avgCpl || 0} CPL`;
                if (statsEl) statsEl.innerText = `${Math.round((data.blunderRate || 0) * 100)}% blunder rate`;
            };
            setSplit('colorWhite', cp.white || { avgCpl: 0, blunderRate: 0 });
            setSplit('colorBlack', cp.black || { avgCpl: 0, blunderRate: 0 });

            // Recommendations
            const recSummary = document.getElementById('coachRecommendationsSummary');
            const practiceRecBtn = document.getElementById('btnPracticeRecommendations');
            
            const topWeaknesses = profile.topWeaknesses || [];
            if (recSummary) {
                if (topWeaknesses.length > 0) {
                    const levelText = profileEstimatedRating ? ` Your puzzles are targeted around ${profileEstimatedRating} rating.` : '';
                    const savedText = savedWeaknessProfile ? ` Last analyzed: ${formatProfileDate(savedWeaknessProfile.weaknessProfile.analysisDate)}.` : '';
                    recSummary.innerText = `Training Profile: ${savedText} Games analyzed: ${profileGamesAnalyzed}. Focus areas: ${topWeaknesses.map(titleCaseTheme).join(', ')}.${levelText}`;
                    if (practiceRecBtn) practiceRecBtn.style.display = 'block';
                } else {
                    recSummary.innerText = 'No weaknesses detected! Keep playing and syncing games to perform detailed RAG analysis.';
                    if (practiceRecBtn) practiceRecBtn.style.display = 'none';
                }
            }
        } else {
            // Hide dashboard, show initial state
            if (dashboard) dashboard.style.display = 'none';
            if (initialState) initialState.style.display = 'block';
            const subtitle = document.querySelector('.profile-subtitle');
            if (subtitle) {
                subtitle.innerText = 'Analyze your games once for personalized puzzles, or start general balanced training right away.';
            }
            
            const progressContainer = document.getElementById('analysisProgressContainer');
            if (progressContainer) progressContainer.style.display = 'none';
        }

        const puzzles = profile.recommendedPuzzles || [];

        els.summary.innerText = profile.summary || 'No saved profile yet. You can analyze games for personalized training, or start general training now.';
        renderLogs(profile.logs || []);
        renderPuzzles(puzzles, profile.puzzleDatabaseMessage);
    }

    async function resetTrainingMemory() {
        profile = null;
        try {
            await fetch(`${TRAINING_API_BASE}/skill-profile`, {
                method: 'DELETE'
            });
        } catch (err) {
            renderLogs([`[TrainingCoach] ${BACKEND_OFFLINE_MESSAGE}`]);
        }
    }

    function renderPuzzles(puzzles, message, options = {}) {
        activePuzzles = filterCompletedPuzzles(puzzles || []);
        sessionMode = options.mode || NORMAL_MODE;
        activeBoss = sessionMode === BOSS_MODE ? (options.boss || getBossForLevel(3)) : null;
        activeBossChallenge = sessionMode === BOSS_MODE ? options.challenge || buildBossChallenge(activeBoss) : null;
        activeBossLevel = activeBoss ? activeBoss.level : null;
        isBossBattleActive = Boolean(activeBoss);
        bossLevel = activeBossLevel;
        bossName = activeBoss ? activeBoss.name : '';
        bossRequiredCorrect = activeBossChallenge ? activeBossChallenge.requiredCorrect : 0;
        bossCorrectCount = 0;
        bossPlayerHp = activeBossChallenge ? activeBossChallenge.lives : 0;
        bossWon = false;
        bossLost = false;
        bossCorrect = 0;
        bossBonusXp = 0;
        stopBossTimer();
        bossTimerSeconds = activeBossChallenge ? activeBossChallenge.timerSeconds : null;
        bossTimerRemaining = bossTimerSeconds;
        activePuzzleIndex = -1;
        solutionMoves = [];
        solutionIndex = 0;
        puzzleInteractiveStartIndex = 0;
        currentPuzzleHadMistake = false;
        puzzleSetResults = new Map();
        currentStreak = getStoredStreak(currentStreak);
        bestSessionStreak = 0;
        currentHp = activeBossChallenge ? bossPlayerHp : maxHp;
        sessionXp = 0;
        startingLevel = getDisplayedLevelFromXp(totalXp);
        sessionSummaryRecorded = false;
        sessionEndedBy = 'active';
        els.puzzles.innerHTML = '';

        if (!activePuzzles.length) {
            const fallbackMessage = sessionMode === BOSS_MODE
                ? 'No boss battle puzzles are available right now.'
                : sessionMode === GENERAL_MODE
                    ? 'You’ve completed all available general training puzzles.'
                    : 'No matching puzzles found in the database.';
            els.puzzles.innerHTML = `<div class="empty-state">${message || fallbackMessage}</div>`;
            updatePuzzleStatus();
            return;
        }

        activePuzzles.forEach((puzzle, index) => {
            const card = document.createElement('div');
            card.className = 'training-card';
            card.innerHTML = `
                <div class="training-card-title">
                    <span>${titleCaseTheme(puzzle.matchedWeakness || (puzzle.themes || [])[0] || 'Puzzle')}</span>
                    <span>${puzzle.rating || 'Unrated'}</span>
                </div>
                <div class="training-card-meta">${(puzzle.themes || []).join(', ')}</div>
                <p>${puzzle.description || 'Solve the tactic from the starting position.'}</p>
                <button class="primary-btn" data-index="${index}">Start</button>
            `;
            card.querySelector('button').addEventListener('click', () => startPuzzle(index));
            els.puzzles.appendChild(card);
        });
        updatePuzzleStatus();
    }

    async function fetchProfile() {
        try {
            const response = await fetch(`${TRAINING_API_BASE}/skill-profile`);
            if (!response.ok) throw new Error('Profile request failed');
            renderProfile(await response.json());
        } catch (err) {
            renderLogs([`[TrainingCoach] ${BACKEND_OFFLINE_MESSAGE}`]);
            renderPuzzles([], BACKEND_OFFLINE_MESSAGE);
        }
    }

    async function runSkillAnalysis() {
                const username = getChessComUsername();
        if (!username) {
            alert('No username could be detected. Please sync Chess.com games first.');
            return;
        }

        const storedGames = await getSavedGamesForTraining();
        if (storedGames.length === 0) {
            alert('No saved games found to analyze. Please sync games from Chess.com first.');
            return;
        }

        const progressContainer = document.getElementById('analysisProgressContainer');
        const progressBar = document.getElementById('analysisProgressBar');
        const progressText = document.getElementById('progressText');
        const progressPercentage = document.getElementById('progressPercentage');
        const startAnalysisBtn = document.getElementById('btnStartSkillAnalysis');
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (startAnalysisBtn) startAnalysisBtn.disabled = true;
        if (els.analyze) {
            els.analyze.disabled = true;
            els.analyze.innerText = 'Analyzing...';
        }

        try {
            renderLogs(['[TrainingCoach] Starting client-side Stockfish WASM analysis...']);
            
            // Run client-side analysis
            const analyzedGames = await window.skillAnalysisEngine.analyzeUserSkill(
                storedGames,
                username,
                (current, total) => {
                    const percent = Math.round((current / total) * 100);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressText) progressText.innerText = `Evaluating move ${current} of ${total}...`;
                    if (progressPercentage) progressPercentage.innerText = `${percent}%`;
                },
                { depth: 16, maxMoves: 200 }
            );

            const movesAnalyzed = analyzedGames.reduce((sum, game) => {
                return sum + ((game.allMoveEvaluations || []).length);
            }, 0);

            renderLogs([
                `[TrainingCoach] Stockfish analysis finished. Analyzed ${analyzedGames.length} games.`,
                `[TrainingCoach] Moves analyzed: ${movesAnalyzed}/200 rolling recent moves.`,
                '[TrainingCoach] Detecting weaknesses on backend...'
            ]);

            // Now POST the analyzed games to backend
            const response = await fetch(`${TRAINING_API_BASE}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ games: analyzedGames, excludeIds: getCompletedPuzzleIds() })
            });

            if (!response.ok) {
                throw new Error('Backend weakness detection failed');
            }

            const backendResponse = await response.json();

            // Build UserSkillProfile
            const finalProfile = window.skillProfileBuilder.buildSkillProfile(
                analyzedGames,
                backendResponse,
                username
            );

            // POST profile to backend
            const saveResponse = await fetch(`${TRAINING_API_BASE}/skill-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalProfile)
            });
            if (!saveResponse.ok) {
                throw new Error('Failed to save updated training profile');
            }
            const savedRecord = saveWeaknessProfile(finalProfile, storedGames);

            renderLogs(['[TrainingCoach] Skill Profile updated successfully!']);
            renderProfile(getProfileFromWeaknessRecord(savedRecord) || finalProfile);

        } catch (err) {
            console.error(err);
            const message = err instanceof TypeError && err.message === 'Failed to fetch'
                ? BACKEND_OFFLINE_MESSAGE
                : err.message;
            renderLogs([
                `[TrainingCoach] Skill analysis failed: ${message}`,
                'Run npm run backend in another terminal, then try again.'
            ]);
            alert(`Analysis failed: ${message}`);
        } finally {
            if (progressContainer) progressContainer.style.display = 'none';
            if (startAnalysisBtn) startAnalysisBtn.disabled = false;
            if (els.analyze) {
                els.analyze.disabled = false;
                els.analyze.innerText = savedWeaknessProfile ? 'Reanalyze Games' : 'Analyze Recent Games';
            }
        }
    }

    function practiceRecommendations() {
        const savedThemes = savedWeaknessProfile && savedWeaknessProfile.weaknessProfile.recommendedPuzzleThemes;
        const themes = (profile && profile.topWeaknesses && profile.topWeaknesses.length > 0)
            ? profile.topWeaknesses
            : savedThemes;
        if (!themes || themes.length === 0) {
            startGeneralTraining();
            return;
        }
        loadPuzzlesForTheme(themes[0], { level: getCurrentTrainingLevel() });
    }

    function getBalancedGeneralTrainingTheme() {
        const availableThemes = GENERAL_TRAINING_THEMES.slice();
        const currentIndex = totalXp % availableThemes.length;
        return availableThemes[currentIndex] || 'tacticalAwareness';
    }

    function startGeneralTraining() {
        sessionMode = GENERAL_MODE;
        const theme = getBalancedGeneralTrainingTheme();
        activePuzzleTheme = theme;
        const level = getCurrentTrainingLevel();
        const levelRange = getDifficultyRangeForLevel(level);
        const rating = (profile && profile.estimatedPuzzleRating) || activePuzzleTargetRating || 1000;
        setFeedback(`Starting General Training with ${levelRange.label} Level ${level} puzzles.`, '');
        if (typeof document !== 'undefined') {
            const summary = document.getElementById('trainingSummary');
            if (summary) summary.innerText = `General Training: Solve Level ${level} puzzles rated around ${levelRange.min}-${levelRange.max}, across forks, pins, skewers, mates, endgames and general tactics.`;
        }
        loadPuzzlesForTheme(theme, { rating, level });
    }

    function startCurrentProgressionSession() {
        if (getLockedBossLevel(totalXp)) {
            startBossBattle();
            return;
        }
        practiceRecommendations();
    }

    function getCurrentPuzzleIds() {
        return getActivePuzzleIds();
    }

    async function fetchPuzzleBatch(theme, options = {}) {
        const excludeIds = Array.from(new Set([...(options.excludeIds || []), ...getCompletedPuzzleIds()]));
        const ratingParam = options.rating
            ? `&rating=${encodeURIComponent(options.rating)}`
            : '';
        const levelParam = options.level
            ? `&level=${encodeURIComponent(options.level)}`
            : '';
        const bossParam = options.boss === true ? '&boss=1' : '';
        const excludeParam = excludeIds.length > 0 ? `&exclude=${encodeURIComponent(excludeIds.join(','))}` : '';
        const response = await fetch(`${TRAINING_API_BASE}/puzzles?theme=${encodeURIComponent(theme)}${ratingParam}${levelParam}${bossParam}${excludeParam}`);
        if (!response.ok) throw new Error('Puzzle request failed');
        const data = await response.json();
        const puzzles = filterCompletedPuzzles(data.puzzles || []);
        return { ...data, puzzles };
    }

    async function fetchPuzzlesWithFallback(theme, options = {}) {
        const minNeeded = options.minNeeded || 1;
        const attempts = [
            { theme, rating: options.rating, fallback: 'theme+difficulty' },
            { theme, rating: null, fallback: 'theme' },
            { theme: 'tacticalAwareness', rating: null, fallback: 'broad' }
        ];
        const seenAttempts = new Set();

        for (const attempt of attempts) {
            const key = `${attempt.theme}:${attempt.rating || ''}`;
            if (seenAttempts.has(key)) continue;
            seenAttempts.add(key);
            const data = await fetchPuzzleBatch(attempt.theme, { ...options, rating: attempt.rating });
            if ((data.puzzles || []).length >= minNeeded) {
                return { ...data, theme: attempt.theme, fallback: attempt.fallback };
            }
        }

        return {
            puzzles: [],
            theme,
            fallback: 'empty',
            puzzleDatabaseMessage: 'You’ve completed all available puzzles in this category.'
        };
    }

    async function loadPuzzlesForTheme(theme, options = {}) {
        try {
            const level = options.level || getCurrentTrainingLevel();
            activePuzzleTheme = theme;
            activePuzzleTargetRating = options.rating || (profile && profile.estimatedPuzzleRating) || activePuzzleTargetRating;
            const data = await fetchPuzzlesWithFallback(theme, {
                ...options,
                level,
                rating: activePuzzleTargetRating,
                minNeeded: 1
            });
            renderPuzzles((data.puzzles || []).map(p => ({ ...p, matchedWeakness: data.theme || theme })), data.puzzleDatabaseMessage, { mode: options.mode || sessionMode });
            if ((data.puzzles || []).length > 0) {
                activePuzzleTheme = data.theme || theme;
                startPuzzle(0);
            } else {
                setFeedback(data.puzzleDatabaseMessage || 'You’ve completed all available puzzles in this category.', '');
            }
        } catch (err) {
            const message = err instanceof TypeError && err.message === 'Failed to fetch'
                ? BACKEND_OFFLINE_MESSAGE
                : 'Could not load puzzles from the puzzle database.';
            setFeedback(message, 'error');
        }
    }

    async function startBossBattle() {
        try {
            const bossLevel = getLockedBossLevel(totalXp);
            const boss = getBossForLevel(bossLevel);
            if (!boss) {
                setFeedback('No boss battle is unlocked yet. Reach Level 3 to challenge Tactics Goblin.', '');
                updatePuzzleStatus();
                return;
            }
            const challenge = buildBossChallenge(boss);
            activePuzzleTheme = challenge.theme || 'tacticalAwareness';
            const levelRange = getDifficultyRangeForLevel(bossLevel, { boss: true });
            activePuzzleTargetRating = getChallengeRating((profile && profile.estimatedPuzzleRating) || activePuzzleTargetRating || 1000, challenge);
            const neededPuzzles = Math.max(challenge.requiredCorrect + 2, 8);
            const data = await fetchPuzzlesWithFallback(activePuzzleTheme, {
                rating: activePuzzleTargetRating,
                level: bossLevel,
                boss: true,
                minNeeded: Math.min(challenge.requiredCorrect, neededPuzzles)
            });
            const bossPuzzles = (data.puzzles || [])
                .slice(0, neededPuzzles)
                .map(puzzle => ({ ...puzzle, matchedWeakness: data.theme || activePuzzleTheme }));
            renderPuzzles(bossPuzzles, data.puzzleDatabaseMessage, { mode: BOSS_MODE, boss, challenge });
            if (bossPuzzles.length > 0) {
                activePuzzleTheme = data.theme || activePuzzleTheme;
                startPuzzle(0);
                setFeedback(`${boss.name} appears with ${challenge.modifiers.map(modifier => modifier.label).join(', ')}. ${challenge.objectiveLabel}. Boss puzzles target ${levelRange.min}-${levelRange.max}.`, '');
            } else {
                setFeedback(data.puzzleDatabaseMessage || 'You’ve completed all available puzzles in this category.', '');
            }
        } catch (err) {
            const message = err instanceof TypeError && err.message === 'Failed to fetch'
                ? BACKEND_OFFLINE_MESSAGE
                : 'Could not start the boss battle.';
            setFeedback(message, 'error');
        }
    }

    function handleBossCardActivation(event) {
        if (event && event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event) event.preventDefault();
        if (isBossBattleActive) return;
        if (!getLockedBossLevel(totalXp)) return;
        startBossBattle();
    }

    function initPuzzleBoard() {
        if (puzzleBoard) return;
        puzzleGame = new Chess();
        puzzleBoard = Chessboard('trainingPuzzleBoard', {
            draggable: true,
            position: 'start',
            orientation: 'white',
            onDrop,
            onSnapEnd: () => puzzleBoard.position(puzzleGame.fen()),
            pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
        });
        updatePuzzleStatus();
        resizePuzzleBoardSoon();
    }

    function normalizeMoveToken(token) {
        return String(token || '').trim().replace(/[!?]+$/g, '');
    }

    function moveMatches(move, expected) {
        const token = normalizeMoveToken(expected);
        const uci = `${move.from}${move.to}${move.promotion || ''}`;
        return normalizeMoveToken(move.san) === token || uci === token;
    }

    function shouldAutoPlayOpeningBlunder(puzzle) {
        const source = String((puzzle && puzzle.source) || '').toLowerCase();
        return source.includes('lichess.org') || source === 'puzzle-dataset';
    }

    function recordPuzzleResult(isCorrectFirstTry) {
        const puzzle = activePuzzles[activePuzzleIndex];
        const resultKey = getPuzzleResultKey(puzzle);
        if (!resultKey || puzzleSetResults.has(resultKey)) return;
        const rewardKey = `${sessionMode}:${resultKey}:${totalXp}`;
        const previousLevel = getDisplayedLevelFromXp(totalXp);
        puzzleSetResults.set(resultKey, Boolean(isCorrectFirstTry));
        let earnedXp = 0;
        if (isCorrectFirstTry) {
            setStoredStreak(currentStreak + 1);
            bestSessionStreak = Math.max(bestSessionStreak, currentStreak);
            markPuzzleCompleted(puzzle);
            earnedXp = awardPuzzleXp(true);
        }
        recordPuzzleProfileResult(isCorrectFirstTry);
        pendingPuzzleReward = isCorrectFirstTry
            ? { xpEarned: earnedXp, previousLevel, rewardKey }
            : null;
        const bossEnded = handleBossPuzzleSolved();
        updatePuzzleStatus();
        if (bossEnded) return;
        if (pendingPuzzleReward) {
            const newLevel = getDisplayedLevelFromXp(totalXp);
            showRewardOverlay({
                xpEarned: pendingPuzzleReward.xpEarned,
                didLevelComplete: newLevel > pendingPuzzleReward.previousLevel,
                didDefeatBoss: false,
                newLevel,
                rewardKey: pendingPuzzleReward.rewardKey
            });
            pendingPuzzleReward = null;
        }
        maybeFinishPuzzleSet();
    }

    function showPuzzleSessionSummary(reason = 'completed') {
        if (!activePuzzles.length) return;

        sessionEndedBy = reason;
        recordSessionProfileSummary(reason);
        updatePuzzleStatus();
        const correct = [...puzzleSetResults.values()].filter(Boolean).length;
        const total = activePuzzles.length;
        const goodScore = total > 0 && correct / total >= 0.8;
        const currentIds = getCurrentPuzzleIds();
        const theme = activePuzzleTheme || (activePuzzles[0] && activePuzzles[0].matchedWeakness) || (profile && profile.topWeaknesses && profile.topWeaknesses[0]) || 'tacticalAwareness';
        const rating = Number(activePuzzleTargetRating || (profile && profile.estimatedPuzzleRating) || 1000);
        const isBossSummary = reason === 'boss-win' || reason === 'boss-loss';
        const summaryBoss = activeBoss ? {
            name: activeBoss.name,
            level: activeBossLevel,
            hp: activeBossChallenge ? activeBossChallenge.lives : bossPlayerHp,
            requiredCorrect: activeBossChallenge ? activeBossChallenge.requiredCorrect : bossRequiredCorrect,
            modifiers: activeBossChallenge ? activeBossChallenge.modifiers.map(modifier => modifier.label).join(', ') : 'Standard',
            objective: activeBossChallenge ? activeBossChallenge.objectiveLabel : 'Defeat the boss',
            correctCount: bossCorrectCount,
            remainingHp: bossPlayerHp
        } : null;
        const endReasonText = reason === 'hp' || reason === 'boss-loss'
            ? 'Ended by HP reaching 0.'
            : (reason === 'boss-win' ? 'Boss defeated.' : 'Ended by session completion.');
        const gameOverText = reason === 'hp' || reason === 'boss-loss' ? 'Game Over — You ran out of HP.\n' : '';
        const endingLevel = getDisplayedLevelFromXp(totalXp);
        const levelUpText = endingLevel > startingLevel ? `\nLevel Up! You reached Level ${endingLevel}.` : '';
        if (endingLevel > startingLevel) {
            recordActivity({
                type: 'level-completed',
                icon: '★',
                title: `Reached Level ${endingLevel}`,
                detail: `${Math.max(0, endingLevel - 1)} levels completed`,
                xp: sessionXp > 0 ? `+${sessionXp} XP` : '',
                accent: 'yellow'
            });
        }
        if (!isBossSummary || reason === 'boss-loss') {
            recordActivity({
                type: reason === 'boss-loss' ? 'boss-battle-lost' : 'training-session',
                icon: reason === 'boss-loss' ? '♛' : '✚',
                title: reason === 'boss-loss' && summaryBoss ? `${summaryBoss.name} battle ended` : 'Completed Training Coach session',
                detail: `${correct}/${total} puzzles solved${bestSessionStreak ? ` · best streak ${bestSessionStreak}` : ''}`,
                xp: sessionXp > 0 ? `+${sessionXp} XP` : '',
                accent: reason === 'boss-loss' ? 'purple' : 'green'
            });
        }
        const summaryText = isBossSummary && summaryBoss
            ? `${reason === 'boss-win' ? 'Boss defeated!' : 'Boss battle ended.'} ${summaryBoss.name}: ${summaryBoss.correctCount}/${summaryBoss.requiredCorrect} solved. XP earned: ${sessionXp}.`
            : `${gameOverText ? 'Game over. ' : ''}Session complete: ${correct}/${total} solved. Best streak: ${bestSessionStreak}. XP earned: ${sessionXp}. ${endReasonText}`;
        setFeedback(summaryText, reason === 'hp' || reason === 'boss-loss' ? 'error' : 'success');

        const summaryDelay = reason === 'boss-win'
            ? 2300
            : (endingLevel > startingLevel ? 1900 : 1350);
        setTimeout(() => {
            if (isBossSummary) {
                clearBossBattleState();
                if (reason === 'boss-win') {
                    clearCurrentPuzzleSet('Boss defeated. Loading your next regular puzzle...');
                    loadPuzzlesForTheme(theme, { rating, excludeIds: currentIds });
                } else {
                    clearCurrentPuzzleSet('Boss battle lost. Challenge the boss again when you are ready.');
                }
            } else if (goodScore) {
                const nextRating = Math.min(2600, rating + 150);
                setFeedback(`${summaryText} Try harder puzzles around ${nextRating} when you are ready.`, 'success');
            } else if (reason === 'hp') {
                clearCurrentPuzzleSet('Training ended because HP reached 0. Start another session when you are ready.');
            }
        }, summaryDelay);
    }

    function maybeFinishPuzzleSet() {
        if (sessionMode === BOSS_MODE) return;
        if (!activePuzzles.length || puzzleSetResults.size < activePuzzles.length) return;
        showPuzzleSessionSummary('completed');
    }

    function clearCurrentPuzzleSet(message = 'Choose a puzzle to begin.') {
        stopBossTimer();
        activePuzzles = [];
        activePuzzleIndex = -1;
        solutionMoves = [];
        solutionIndex = 0;
        puzzleInteractiveStartIndex = 0;
        currentPuzzleHadMistake = false;
        puzzleSetResults = new Map();
        sessionEndedBy = 'active';
        if (els.puzzles) {
            els.puzzles.innerHTML = `<div class="empty-state">${message}</div>`;
        }
        setFeedback(message, '');
        updatePuzzleStatus();
    }

    function playForcedReplyIfNeeded() {
        if (solutionIndex >= solutionMoves.length) return;
        const expected = solutionMoves[solutionIndex];
        const legalMoves = puzzleGame.moves({ verbose: true });
        const reply = legalMoves.find(move => moveMatches(move, expected));
        if (!reply) return;

        puzzleGame.move(reply);
        solutionIndex++;
        puzzleBoard.position(puzzleGame.fen());
        updatePuzzleStatus();
    }

    function applySolutionMoveAtCurrentIndex() {
        if (!puzzleGame || solutionIndex >= solutionMoves.length) return false;
        const expected = solutionMoves[solutionIndex];
        const move = puzzleGame.moves({ verbose: true }).find(candidate => moveMatches(candidate, expected));
        if (!move) return false;

        puzzleGame.move(move);
        solutionIndex++;
        puzzleBoard.position(puzzleGame.fen());
        updatePuzzleStatus();
        return true;
    }

    function replayPuzzleToIndex(targetIndex) {
        if (activePuzzleIndex < 0 || !puzzleStartFen) return;
        const clampedIndex = Math.max(puzzleInteractiveStartIndex, Math.min(targetIndex, solutionMoves.length));
        puzzleGame = new Chess(puzzleStartFen);
        solutionIndex = 0;

        while (solutionIndex < clampedIndex) {
            if (!applySolutionMoveAtCurrentIndex()) break;
        }

        puzzleBoard.position(puzzleGame.fen());
        updatePuzzleStatus();
    }

    function onDrop(source, target) {
        if (!puzzleGame || activePuzzleIndex < 0) return 'snapback';
        if (sessionEndedBy !== 'active' || currentHp <= 0 || (isBossBattleActive && bossPlayerHp <= 0)) return 'snapback';

        const move = puzzleGame.move({
            from: source,
            to: target,
            promotion: 'q'
        });

        if (move === null) return 'snapback';

        const expected = solutionMoves[solutionIndex];
        if (!moveMatches(move, expected)) {
            puzzleGame.undo();
            if (!currentPuzzleHadMistake) {
                setStoredStreak(0);
                if (isBossBattleActive) {
                    bossPlayerHp = Math.max(0, bossPlayerHp - 1);
                    currentHp = bossPlayerHp;
                    if (activeBossChallenge && activeBossChallenge.objectiveType === 'consecutive') {
                        bossCorrectCount = 0;
                    }
                } else {
                    currentHp = Math.max(0, currentHp - 1);
                }
            }
            currentPuzzleHadMistake = true;
            const puzzle = activePuzzles[activePuzzleIndex];
            const resultKey = getPuzzleResultKey(puzzle);
            if ((isBossBattleActive ? bossPlayerHp : currentHp) === 0 && resultKey && !puzzleSetResults.has(resultKey)) {
                puzzleSetResults.set(resultKey, false);
                recordPuzzleProfileResult(false, false);
                const lossReason = isBossBattleActive ? 'boss-loss' : 'hp';
                if (isBossBattleActive) bossLost = true;
                if (isBossBattleActive) stopBossTimer();
                setFeedback(isBossBattleActive && activeBoss
                    ? `${activeBoss.name} wins. You ran out of HP.`
                    : 'Game Over — You ran out of HP.', 'error');
                updatePuzzleStatus();
                showPuzzleSessionSummary(lossReason);
                return 'snapback';
            }
            setFeedback('Not quite. Try another forcing move from this position.', 'error');
            updatePuzzleStatus();
            return 'snapback';
        }

        solutionIndex++;
        setFeedback('Correct. Keep going.', 'success');
        updatePuzzleStatus();

        if (solutionIndex >= solutionMoves.length) {
            setFeedback('Puzzle complete. Nice work.', 'success');
            recordPuzzleResult(!currentPuzzleHadMistake);
            updatePuzzleStatus();
            return;
        }

        playForcedReplyIfNeeded();

        if (solutionIndex >= solutionMoves.length) {
            setFeedback('Puzzle complete. Nice work.', 'success');
            recordPuzzleResult(!currentPuzzleHadMistake);
        }
        updatePuzzleStatus();
    }

    function startPuzzle(index) {
        initPuzzleBoard();
        const puzzle = activePuzzles[index];
        if (!puzzle) return;

        activePuzzleIndex = index;
        solutionMoves = String(puzzle.moves || '').split(/\s+/).filter(Boolean);
        solutionIndex = 0;
        puzzleInteractiveStartIndex = 0;
        currentPuzzleHadMistake = false;
        puzzleStartFen = puzzle.fen;
        puzzleGame = new Chess(puzzleStartFen);

        if (solutionMoves.length > 1 && shouldAutoPlayOpeningBlunder(puzzle)) {
            applySolutionMoveAtCurrentIndex();
            puzzleInteractiveStartIndex = solutionIndex;
        }

        puzzleSolverSide = puzzleGame.turn() === 'w' ? 'white' : 'black';
        puzzleBoard.orientation(puzzleSolverSide);
        puzzleBoard.position(puzzleGame.fen());
        setFeedback(puzzle.description || 'Find the best move.', '');
        updatePuzzleStatus();
        startBossTimer();
    }

    function startPreviousPuzzle() {
        if (!activePuzzles.length) return;
        const previous = activePuzzleIndex <= 0 ? activePuzzles.length - 1 : activePuzzleIndex - 1;
        startPuzzle(previous);
    }

    function startNextPuzzle() {
        if (!activePuzzles.length) return;
        const next = activePuzzleIndex < 0 ? 0 : (activePuzzleIndex + 1) % activePuzzles.length;
        startPuzzle(next);
    }

    function showPreviousPuzzleMove() {
        if (activePuzzleIndex < 0 || solutionIndex <= puzzleInteractiveStartIndex) return;
        replayPuzzleToIndex(solutionIndex - 1);
        setFeedback('Showing previous move in the solution line.', '');
    }

    function showNextPuzzleMove() {
        const puzzle = activePuzzles[activePuzzleIndex];
        const resultKey = getPuzzleResultKey(puzzle);
        if (!resultKey || !puzzleSetResults.has(resultKey) || solutionIndex >= solutionMoves.length) return;
        if (applySolutionMoveAtCurrentIndex()) {
            setFeedback(solutionIndex >= solutionMoves.length ? 'Puzzle complete. Nice work.' : 'Showing next move in the solution line.', 'success');
        }
    }

    async function open() {
        cacheElements();
        loadTotalXp();
        initPuzzleBoard();
        const savedProfile = loadSavedWeaknessProfile();
        const restoredProfile = getProfileFromWeaknessRecord(savedProfile);
        if (restoredProfile) {
            renderProfile(restoredProfile);
            showNewGamesNoticeIfNeeded();
        } else {
            renderProfile({});
            renderPuzzles([], 'Choose Analyze My Games for personalized training, or Start General Training for balanced puzzles.');
        }
        setTimeout(() => {
            if (puzzleBoard) puzzleBoard.resize();
        }, 0);
    }

    document.addEventListener('DOMContentLoaded', () => {
        cacheElements();
        loadTotalXp();
        updatePuzzleStatus();
        if (els.analyze) els.analyze.addEventListener('click', runSkillAnalysis);
        if (els.prevPuzzle) els.prevPuzzle.addEventListener('click', startPreviousPuzzle);
        if (els.nextPuzzle) els.nextPuzzle.addEventListener('click', startNextPuzzle);
        if (els.prevMove) els.prevMove.addEventListener('click', showPreviousPuzzleMove);
        if (els.nextMove) els.nextMove.addEventListener('click', showNextPuzzleMove);
        if (els.bossStatus) {
            els.bossStatus.addEventListener('click', handleBossCardActivation);
            els.bossStatus.addEventListener('keydown', handleBossCardActivation);
        }
        if (els.xp) {
            els.xp.addEventListener('click', (event) => {
                const action = event.target && event.target.closest('[data-progression-action]');
                if (!action) return;
                if (action.getAttribute('data-progression-action') === 'solve') {
                    startCurrentProgressionSession();
                }
            });
        }
        if (els.fullscreenBoard) els.fullscreenBoard.addEventListener('click', togglePuzzleBoardFullscreen);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && els.boardFullscreenTarget && els.boardFullscreenTarget.classList.contains('is-fullscreen-puzzle')) {
                els.boardFullscreenTarget.classList.remove('is-fullscreen-puzzle');
                updateFullscreenButton();
                updatePuzzleStatus();
                resizePuzzleBoardSoon();
            }
        });
        
        const startSkillAnalysisBtn = document.getElementById('btnStartSkillAnalysis');
        if (startSkillAnalysisBtn) startSkillAnalysisBtn.addEventListener('click', runSkillAnalysis);
        if (els.generalTraining) els.generalTraining.addEventListener('click', startGeneralTraining);

        const practiceRecBtn = document.getElementById('btnPracticeRecommendations');
        if (practiceRecBtn) practiceRecBtn.addEventListener('click', practiceRecommendations);

        window.addEventListener('chess-profile-switched', () => {
            loadTotalXp();
            const savedProfile = loadSavedWeaknessProfile();
            const restoredProfile = getProfileFromWeaknessRecord(savedProfile);
            renderProfile(restoredProfile || {});
            clearCurrentPuzzleSet('Switched Chess.com profile. Choose a training session to continue.');
            updatePuzzleStatus();
        });
    });

    window.trainingCoachUI = {
        open,
        analyzeTraining: runSkillAnalysis
    };
})();
