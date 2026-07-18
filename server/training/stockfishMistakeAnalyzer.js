function analyzeSavedGames(games, options = {}) {
    let userColorKnownGames = 0;
    let mistakes = [];
    let movesAnalyzed = 0;

    (games || []).forEach(game => {
        // userSide is passed from frontend, e.g. "white" or "black"
        const side = game.userSide || game.userColor;
        if (side && side !== 'unknown') {
            userColorKnownGames++;
        }

        const gameMistakes = game.analyzedMistakes || game.mistakes || [];
        movesAnalyzed += (game.allMoveEvaluations || []).length;
        gameMistakes.forEach(m => {
            // Ensure evalSwing is calculated and positive
            let evalSwing = m.evalSwing;
            if (evalSwing === undefined && m.evalBefore !== undefined && m.evalAfter !== undefined) {
                evalSwing = Math.abs(m.evalBefore - m.evalAfter);
            }

            mistakes.push({
                gameId: game.id || 'unknown',
                gameTitle: game.title || game.name || 'Synced Game',
                moveNumber: m.moveNumber,
                userMove: m.userMove,
                bestMove: m.bestMove,
                evalBefore: m.evalBefore,
                evalAfter: m.evalAfter,
                evalSwing: evalSwing || 0,
                fenBefore: m.fenBefore,
                reason: m.reason || '',
                principalVariation: m.principalVariation || []
            });
        });
    });

    return {
        gamesAnalyzed: games.length,
        userColorKnownGames,
        movesAnalyzed,
        mistakes
    };
}

module.exports = {
    analyzeSavedGames
};
