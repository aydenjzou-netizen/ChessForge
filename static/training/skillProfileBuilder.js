/**
 * Skill Profile Builder (Client-Side)
 */
(function () {
    function countPieces(fen) {
        return (fen.split(' ')[0].match(/[prnbqk]/gi) || []).length;
    }

    function getPhase(moveNumber, fen) {
        if (moveNumber <= 15) return 'opening';
        if (countPieces(fen) <= 12) return 'endgame';
        if (moveNumber <= 30) return 'middlegame';
        return 'endgame';
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function roundToNearest(value, step) {
        return Math.round(value / step) * step;
    }

    function estimatePuzzleRating(averageCentipawnLoss, blunderRate, mistakeRate, inaccuracyRate, totalMoves) {
        if (!totalMoves) return 1000;
        const rawRating = 2200
            - averageCentipawnLoss * 9
            - blunderRate * 700
            - mistakeRate * 350
            - inaccuracyRate * 120;
        return roundToNearest(clamp(rawRating, 500, 2400), 50);
    }

    function buildSkillProfile(analyzedGames, backendResponse, username) {
        let totalMoves = 0;
        let totalCpl = 0;
        const moveClassification = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
        
        const phaseStats = {
            opening: { totalCpl: 0, totalMoves: 0, blunderCount: 0, mistakeCount: 0 },
            middlegame: { totalCpl: 0, totalMoves: 0, blunderCount: 0, mistakeCount: 0 },
            endgame: { totalCpl: 0, totalMoves: 0, blunderCount: 0, mistakeCount: 0 }
        };

        const colorPerformance = {
            white: { totalCpl: 0, totalMoves: 0, blunderCount: 0, mistakeCount: 0, weaknesses: [] },
            black: { totalCpl: 0, totalMoves: 0, blunderCount: 0, mistakeCount: 0, weaknesses: [] }
        };

        analyzedGames.forEach(game => {
            const side = game.userSide;
            if (!side || side === 'unknown') return;

            const evals = game.allMoveEvaluations || [];
            evals.forEach(ev => {
                totalMoves++;
                totalCpl += ev.evalSwing;
                
                // Classification counts
                if (moveClassification[ev.classification] !== undefined) {
                    moveClassification[ev.classification]++;
                }

                const phase = getPhase(ev.moveNumber, ev.fenBefore);
                
                // Phase stats
                phaseStats[phase].totalMoves++;
                phaseStats[phase].totalCpl += ev.evalSwing;
                if (ev.classification === 'blunder') phaseStats[phase].blunderCount++;
                if (ev.classification === 'mistake') phaseStats[phase].mistakeCount++;

                // Color performance
                colorPerformance[side].totalMoves++;
                colorPerformance[side].totalCpl += ev.evalSwing;
                if (ev.classification === 'blunder') colorPerformance[side].blunderCount++;
                if (ev.classification === 'mistake') colorPerformance[side].mistakeCount++;
            });
        });

        // Compute Averages
        const averageCentipawnLoss = totalMoves > 0 ? Math.round((totalCpl / totalMoves) * 10) / 10 : 0;
        const blunderRate = totalMoves > 0 ? Math.round((moveClassification.blunder / totalMoves) * 1000) / 1000 : 0;
        const mistakeRate = totalMoves > 0 ? Math.round((moveClassification.mistake / totalMoves) * 1000) / 1000 : 0;
        const inaccuracyRate = totalMoves > 0 ? Math.round((moveClassification.inaccuracy / totalMoves) * 1000) / 1000 : 0;
        const estimatedPuzzleRating = backendResponse.estimatedPuzzleRating ||
            estimatePuzzleRating(averageCentipawnLoss, blunderRate, mistakeRate, inaccuracyRate, totalMoves);
        const puzzleRatingRange = backendResponse.puzzleRatingRange || {
            min: clamp(estimatedPuzzleRating - 250, 400, 2600),
            max: clamp(estimatedPuzzleRating + 250, 400, 2600)
        };

        // Final phase stats computation
        const computedPhaseStats = {};
        let maxPhaseCpl = -1;
        let weakestPhase = 'middlegame';

        for (const phase in phaseStats) {
            const p = phaseStats[phase];
            const avgCpl = p.totalMoves > 0 ? Math.round((p.totalCpl / p.totalMoves) * 10) / 10 : 0;
            computedPhaseStats[phase] = {
                avgCpl,
                blunders: p.blunderCount,
                mistakes: p.mistakeCount,
                totalMoves: p.totalMoves
            };
            if (avgCpl > maxPhaseCpl && p.totalMoves > 0) {
                maxPhaseCpl = avgCpl;
                weakestPhase = phase;
            }
        }

        // Final color performance stats computation
        const computedColorPerformance = {};
        for (const side in colorPerformance) {
            const c = colorPerformance[side];
            const avgCpl = c.totalMoves > 0 ? Math.round((c.totalCpl / c.totalMoves) * 10) / 10 : 0;
            const bRate = c.totalMoves > 0 ? Math.round((c.blunderCount / c.totalMoves) * 100) / 100 : 0;
            computedColorPerformance[side] = {
                avgCpl,
                blunderRate: bRate,
                weaknesses: [] // will populate from backend weaknesses
            };
        }

        // Map weaknesses from backend to colors if available
        const backendWeaknesses = backendResponse.weaknesses || [];
        backendWeaknesses.forEach(w => {
            // Find which color this weakness occurred in most
            let whiteCount = 0;
            let blackCount = 0;
            (w.evidence || []).forEach(ev => {
                // Find matching game to see user side
                const matchedGame = analyzedGames.find(g => g.id === ev.gameId);
                if (matchedGame) {
                    if (matchedGame.userSide === 'white') whiteCount++;
                    if (matchedGame.userSide === 'black') blackCount++;
                }
            });

            if (whiteCount > 0 && whiteCount >= blackCount) {
                computedColorPerformance.white.weaknesses.push(w.theme);
            }
            if (blackCount > 0 && blackCount >= whiteCount) {
                computedColorPerformance.black.weaknesses.push(w.theme);
            }
        });

        const topWeaknesses = backendWeaknesses.slice(0, 3).map(w => w.theme);
        const recommendedPuzzleThemes = backendWeaknesses.slice(0, 3).map(w => w.theme);

        return {
            username,
            gamesAnalyzed: analyzedGames.length,
            totalMovesAnalyzed: totalMoves,
            averageCentipawnLoss,
            blunderRate,
            mistakeRate,
            inaccuracyRate,
            moveClassification,
            weakestPhase,
            phaseStats: computedPhaseStats,
            recurringWeaknesses: backendWeaknesses.map(w => ({
                theme: w.theme,
                count: w.count,
                confidence: w.confidence,
                explanation: w.explanation
            })),
            colorPerformance: computedColorPerformance,
            topWeaknesses,
            recommendedPuzzleThemes,
            recommendedPuzzles: backendResponse.recommendedPuzzles || [],
            estimatedPuzzleRating,
            puzzleRatingRange,
            puzzleDatabaseMessage: backendResponse.puzzleDatabaseMessage,
            evidence: backendWeaknesses.flatMap(w => (w.evidence || []).map(ev => ({
                theme: w.theme,
                ...ev
            }))),
            analyzedAt: new Date().toISOString()
        };
    }

    window.skillProfileBuilder = {
        buildSkillProfile
    };
})();
