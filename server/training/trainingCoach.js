const { analyzeSavedGames } = require('./stockfishMistakeAnalyzer');
const { detectWeaknesses } = require('./weaknessDetector');
const {
    loadPuzzles,
    recommendPuzzles,
    getPuzzlesForTheme,
    getPuzzleLoadMessage,
    getPuzzleDatabaseStatusMessage,
    getDifficultyRangeForLevel
} = require('./puzzleRetriever');

function createEmptyProfile() {
    return {
        gamesAnalyzed: 0,
        lastUpdated: null,
        weaknesses: [],
        recommendedPuzzles: [],
        puzzleDatabaseMessage: getPuzzleDatabaseStatusMessage(),
        logs: []
    };
}

function logLine(message, logs) {
    console.log(message);
    if (logs) logs.push(message);
}

function summarizeWeaknesses(weaknesses) {
    if (!weaknesses.length) {
        return 'Analyze recent games to discover targeted practice areas.';
    }
    const labels = weaknesses.slice(0, 3).map(w => w.theme);
    return `Based on your recent games, one area to practice is ${labels.join(', ')}.`;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function roundToNearest(value, step) {
    return Math.round(value / step) * step;
}

function estimatePuzzleRatingFromAnalysis(savedGames, analysis) {
    const moveEvaluations = [];

    (savedGames || []).forEach(game => {
        (game.allMoveEvaluations || []).forEach(ev => {
            const swing = Number(ev.evalSwing);
            if (Number.isFinite(swing)) moveEvaluations.push({ ...ev, evalSwing: Math.max(0, swing) });
        });
    });

    if (moveEvaluations.length > 0) {
        const totalMoves = moveEvaluations.length;
        const totalCpl = moveEvaluations.reduce((sum, ev) => sum + ev.evalSwing, 0);
        const averageCentipawnLoss = totalCpl / totalMoves;
        const blunderRate = moveEvaluations.filter(ev => ev.classification === 'blunder' || ev.evalSwing > 200).length / totalMoves;
        const mistakeRate = moveEvaluations.filter(ev => ev.classification === 'mistake' || (ev.evalSwing > 100 && ev.evalSwing <= 200)).length / totalMoves;
        const inaccuracyRate = moveEvaluations.filter(ev => ev.classification === 'inaccuracy' || (ev.evalSwing > 50 && ev.evalSwing <= 100)).length / totalMoves;
        const rawRating = 2200 - averageCentipawnLoss * 9 - blunderRate * 700 - mistakeRate * 350 - inaccuracyRate * 120;
        return roundToNearest(clamp(rawRating, 500, 2400), 50);
    }

    const gamesAnalyzed = Math.max(1, analysis.gamesAnalyzed || 1);
    const mistakesPerGame = (analysis.mistakes || []).length / gamesAnalyzed;
    const averageSwingPawns = (analysis.mistakes || []).length
        ? (analysis.mistakes || []).reduce((sum, ev) => sum + Math.abs(Number(ev.evalSwing) || 0), 0) / analysis.mistakes.length
        : 0.5;
    const rawRating = 1700 - mistakesPerGame * 120 - averageSwingPawns * 80;
    return roundToNearest(clamp(rawRating, 500, 2200), 50);
}

function ratingBandFor(targetRating) {
    const rating = Number(targetRating) || 1000;
    return {
        min: clamp(rating - 250, 400, 2600),
        max: clamp(rating + 250, 400, 2600)
    };
}

async function analyzeTrainingProfile(savedGames, options = {}) {
    const logs = [];
    logLine('[TrainingCoach] Starting analysis', logs);

    const analysis = await analyzeSavedGames(savedGames || [], options);
    logLine(`[TrainingCoach] Games analyzed: ${analysis.gamesAnalyzed}`, logs);
    logLine(`[TrainingCoach] Moves analyzed: ${analysis.movesAnalyzed || 0}/200 rolling recent moves`, logs);
    logLine(`[TrainingCoach] User color known games: ${analysis.userColorKnownGames}`, logs);
    logLine(`[TrainingCoach] Stockfish mistakes found: ${analysis.mistakes.length}`, logs);

    const weaknesses = detectWeaknesses(analysis.mistakes);
    logLine(`[TrainingCoach] Weaknesses detected: ${weaknesses.length}`, logs);

    const estimatedPuzzleRating = estimatePuzzleRatingFromAnalysis(savedGames || [], analysis);
    const puzzleRatingRange = ratingBandFor(estimatedPuzzleRating);
    logLine(`[TrainingCoach] Estimated puzzle rating: ${estimatedPuzzleRating}`);

    const puzzles = loadPuzzles();
    const puzzleDatabaseMessage = getPuzzleLoadMessage();
    const recommendedPuzzles = recommendPuzzles(weaknesses, {
        puzzles,
        targetRating: estimatedPuzzleRating,
        ratingWindow: 250,
        excludeIds: options.excludeIds || []
    });

    const profile = {
        gamesAnalyzed: analysis.gamesAnalyzed,
        lastUpdated: new Date().toISOString(),
        summary: summarizeWeaknesses(weaknesses),
        weaknesses,
        recommendedPuzzles,
        estimatedPuzzleRating,
        puzzleRatingRange,
        analysisWindow: {
            maxMoves: 200,
            movesAnalyzed: analysis.movesAnalyzed || 0,
            rollingWindow: true
        },
        puzzleDatabaseMessage,
        mistakeEvidence: analysis.mistakes,
        logs
    };

    return profile;
}

function getTrainingPuzzles(theme, options = {}) {
    const profile = options.profile || createEmptyProfile();
    const targetRating = Number(options.targetRating) || profile.estimatedPuzzleRating || null;
    const level = Number(options.level) || null;
    const isBoss = options.boss === true;
    const puzzles = getPuzzlesForTheme(theme || 'tacticalAwareness', {
        targetRating,
        level,
        boss: isBoss,
        ratingWindow: 250,
        excludeIds: options.excludeIds || []
    });
    const difficultyRange = level ? getDifficultyRangeForLevel(level, { boss: isBoss }) : null;
    return {
        puzzles,
        estimatedPuzzleRating: targetRating,
        puzzleRatingRange: difficultyRange || (targetRating ? ratingBandFor(targetRating) : null),
        difficultyRange,
        puzzleDatabaseMessage: getPuzzleLoadMessage()
    };
}

module.exports = {
    analyzeTrainingProfile,
    getTrainingPuzzles,
    createEmptyProfile
};
