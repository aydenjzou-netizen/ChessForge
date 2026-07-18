const { Chess } = require('../../backend/node_modules/chess.js/chess');
const { tagsForWeakness } = require('./puzzleRetriever');

const KNOWN_THEMES = [
    'fork',
    'pin',
    'skewer',
    'discoveredAttack',
    'hangingPiece',
    'missedCheckmate',
    'backRank',
    'kingSafety',
    'openingPrinciples',
    'endgameTechnique',
    'pawnStructure',
    'materialLoss',
    'badTrade',
    'tacticalAwareness'
];

function countPieces(fen) {
    return (fen.split(' ')[0].match(/[prnbqk]/gi) || []).length;
}

function pvContainsCheck(evidence) {
    return String([evidence.bestMove, ...(evidence.principalVariation || [])].join(' ')).includes('+') ||
        String([evidence.bestMove, ...(evidence.principalVariation || [])].join(' ')).includes('#');
}

function bestMoveIsMate(evidence) {
    const text = String([evidence.bestMove, ...(evidence.principalVariation || [])].join(' ')).toLowerCase();
    return text.includes('#') || text.includes('mate');
}

function classifyMistake(evidence) {
    const tags = new Set();
    const moveText = `${evidence.userMove || ''} ${(evidence.principalVariation || []).join(' ')} ${evidence.bestMove || ''}`;

    if (bestMoveIsMate(evidence)) tags.add('missedCheckmate');
    if (evidence.moveNumber <= 10) tags.add('openingPrinciples');
    if (countPieces(evidence.fenBefore) <= 12) tags.add('endgameTechnique');
    if (/[x]/.test(moveText) && Math.abs(evidence.evalSwing) >= 1.5) tags.add('materialLoss');
    if (/[x]/.test(evidence.userMove || '') && Math.abs(evidence.evalSwing) >= 1.5) tags.add('badTrade');
    if (pvContainsCheck(evidence)) tags.add('kingSafety');
    if (pvContainsCheck(evidence) || Math.abs(evidence.evalSwing) >= 2.25) tags.add('tacticalAwareness');

    try {
        const before = new Chess(evidence.fenBefore);
        const legal = before.moves({ verbose: true });
        const best = legal.find(move => move.san === evidence.bestMove);
        if (best && best.piece === 'n' && /[+#x]/.test(best.san)) tags.add('fork');
        if (best && best.piece === 'b' && /[+#x]/.test(best.san)) tags.add('pin');
        if (best && best.piece === 'r' && /[+#x]/.test(best.san)) tags.add('skewer');
    } catch (err) {
        // Keep rule-based classification resilient.
    }

    if (tags.size === 0) tags.add('tacticalAwareness');
    return [...tags].filter(theme => KNOWN_THEMES.includes(theme));
}

function explanationForTheme(theme) {
    const copy = {
        fork: 'One area to practice is spotting double attacks before they appear.',
        pin: 'One area to practice is recognizing pinned pieces and pressure on lines.',
        skewer: 'One area to practice is noticing aligned high-value pieces.',
        discoveredAttack: 'One area to practice is looking for discovered threats.',
        hangingPiece: 'One area to practice is checking whether pieces are loose after each move.',
        missedCheckmate: 'One area to practice is checking forcing mate threats.',
        backRank: 'One area to practice is back-rank safety.',
        kingSafety: 'This appeared in your games as positions where checks or king exposure mattered.',
        openingPrinciples: 'This appeared early in several games, so development and king safety are useful practice areas.',
        endgameTechnique: 'This appeared in simplified positions, so endgame technique is a good target.',
        pawnStructure: 'One area to practice is improving pawn structure decisions.',
        materialLoss: 'This appeared as evaluation drops connected to material or forcing sequences.',
        badTrade: 'One area to practice is checking whether trades help your position.',
        tacticalAwareness: 'This appeared as missed forcing moves or tactical resources.'
    };
    return copy[theme] || 'One area to practice is this recurring pattern.';
}

function detectWeaknesses(mistakes) {
    const grouped = new Map();

    (mistakes || []).forEach(evidence => {
        classifyMistake(evidence).forEach(theme => {
            if (!grouped.has(theme)) grouped.set(theme, []);
            grouped.get(theme).push({
                gameId: evidence.gameId,
                gameTitle: evidence.gameTitle,
                moveNumber: evidence.moveNumber,
                userMove: evidence.userMove,
                bestMove: evidence.bestMove,
                evalBefore: evidence.evalBefore,
                evalAfter: evidence.evalAfter,
                evalSwing: evidence.evalSwing,
                reason: evidence.reason || explanationForTheme(theme)
            });
        });
    });

    return [...grouped.entries()]
        .map(([theme, evidence]) => ({
            theme,
            confidence: Number(Math.min(0.95, 0.45 + evidence.length * 0.12).toFixed(2)),
            count: evidence.length,
            explanation: explanationForTheme(theme),
            evidence: evidence.slice(0, 5),
            recommendedPuzzleTags: tagsForWeakness(theme)
        }))
        .sort((a, b) => b.count - a.count || b.confidence - a.confidence);
}

module.exports = {
    KNOWN_THEMES,
    classifyMistake,
    detectWeaknesses
};
