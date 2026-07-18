/**
 * Client-Side Stockfish WASM Analysis Engine
 */
(function () {
    // UCI parser helpers
    function getEvaluation(worker, fen, depth = 16) {
        return new Promise((resolve, reject) => {
            let bestMove = null;
            let score = 0;
            const sideToMove = fen.split(' ')[1]; // 'w' or 'b'

            const onMessage = (event) => {
                const message = typeof event.data === 'string' ? event.data : '';

                if (message.startsWith('info') && message.includes('score')) {
                    const cpMatch = message.match(/score cp (-?\d+)/);
                    if (cpMatch) {
                        const cp = parseInt(cpMatch[1], 10);
                        score = cp;
                    } else {
                        const mateMatch = message.match(/score mate (-?\d+)/);
                        if (mateMatch) {
                            const mate = parseInt(mateMatch[1], 10);
                            // Assign high score for mate
                            score = mate > 0 ? (20000 - mate * 100) : (-20000 - mate * 100);
                        }
                    }
                }

                if (message.startsWith('bestmove')) {
                    const parts = message.split(' ');
                    bestMove = parts[1];
                    worker.removeEventListener('message', onMessage);
                    resolve({ bestMove, score });
                }
            };

            worker.addEventListener('message', onMessage);
            worker.postMessage('stop');
            worker.postMessage(`position fen ${fen}`);
            worker.postMessage(`go depth ${depth}`);
        });
    }

    async function initializeStockfishWorker() {
        const wasmSupported = typeof WebAssembly === 'object' &&
            WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
        const workerPath = wasmSupported ? 'stockfish.wasm.js' : 'stockfish.js';
        console.log(`[SkillAnalysisEngine] Initializing Stockfish worker from ${workerPath}`);
        
        const worker = new Worker(workerPath);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error("Stockfish initialization timed out"));
            }, 10000);

            const onMessage = (event) => {
                if (event.data === 'uciok') {
                    clearTimeout(timeout);
                    worker.removeEventListener('message', onMessage);
                    resolve(worker);
                }
            };

            worker.addEventListener('message', onMessage);
            worker.postMessage('uci');
        });
    }

    function parseChessDate(dateValue, timeValue) {
        const date = String(dateValue || '').replace(/\?/g, '').trim();
        if (!date) return null;

        const normalizedDate = date.replace(/\./g, '-');
        const normalizedTime = String(timeValue || '00:00:00').replace(/\?/g, '0').trim() || '00:00:00';
        const timestamp = Date.parse(`${normalizedDate}T${normalizedTime}Z`);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function getGameTimestamp(game, headers, fallbackIndex) {
        const headerTime = parseChessDate(
            headers.UTCDate || headers.Date,
            headers.UTCTime || headers.Time
        );
        if (headerTime !== null) return headerTime;

        const createdAt = Date.parse(game.createdAt || game.savedAt || '');
        if (Number.isFinite(createdAt)) return createdAt;

        return fallbackIndex;
    }

    function selectRecentMoveKeys(gamesToProcess, maxMoves) {
        const allMoves = [];

        gamesToProcess
            .slice()
            .sort((a, b) => a.gameTimestamp - b.gameTimestamp || a.gameIndex - b.gameIndex)
            .forEach(gp => {
                gp.userMoves.forEach((move, moveIndex) => {
                    allMoves.push({
                        key: `${gp.gameIndex}:${moveIndex}`,
                        gameTimestamp: gp.gameTimestamp,
                        gameIndex: gp.gameIndex,
                        moveIndex
                    });
                });
            });

        return new Set(allMoves.slice(-maxMoves).map(move => move.key));
    }

    /**
     * Analyzes recent synced games and returns move evaluations.
     */
    async function analyzeUserSkill(games, chessComUsername, onProgress, options = {}) {
        const depth = options.depth || 16;
        const maxMoves = Number(options.maxMoves) || 200;
        const normalizedUser = String(chessComUsername || '').trim().toLowerCase();

        if (!normalizedUser) {
            throw new Error("No Chess.com username configured for analysis.");
        }

        console.log(`[SkillAnalysisEngine] Starting analysis for user: ${normalizedUser}`);
        const worker = await initializeStockfishWorker();

        const gamesResult = [];
        let totalMovesToAnalyze = 0;
        let movesAnalyzedCount = 0;

        // Step 1: Pre-process games, then keep only the newest user moves.
        const gamesToProcess = [];
        (games || []).forEach((game, gameIndex) => {
            const chess = new Chess();
            const pgn = game.pgn || game.rawPGN;
            if (!pgn || !chess.load_pgn(pgn)) {
                return;
            }

            const headers = chess.header();
            const whitePlayer = String(headers.White || '').toLowerCase();
            const blackPlayer = String(headers.Black || '').toLowerCase();
            const gameTimestamp = getGameTimestamp(game, headers, gameIndex);

            let userSide = 'unknown';
            if (whitePlayer === normalizedUser) {
                userSide = 'white';
            } else if (blackPlayer === normalizedUser) {
                userSide = 'black';
            }

            if (userSide === 'unknown') {
                return; // Skip games where user side cannot be identified
            }

            const history = chess.history({ verbose: true });
            const userMoves = [];

            // Reset board to play through moves
            const playChess = new Chess();
            if (headers.FEN) {
                playChess.load(headers.FEN);
            }

            history.forEach((move, idx) => {
                const fenBefore = playChess.fen();
                const color = move.color === 'w' ? 'white' : 'black';
                
                playChess.move(move.san);
                const fenAfter = playChess.fen();

                if (color === userSide) {
                    userMoves.push({
                        moveNumber: Math.floor(idx / 2) + 1,
                        userMove: move.san,
                        userMoveUci: `${move.from}${move.to}${move.promotion || ''}`,
                        fenBefore,
                        fenAfter
                    });
                }
            });

            gamesToProcess.push({
                game,
                gameIndex,
                gameTimestamp,
                userSide,
                userMoves,
                title: game.title || `${headers.White} vs ${headers.Black}`
            });
        });

        const recentMoveKeys = selectRecentMoveKeys(gamesToProcess, maxMoves);
        gamesToProcess.forEach(gp => {
            gp.userMoves = gp.userMoves.filter((move, moveIndex) => recentMoveKeys.has(`${gp.gameIndex}:${moveIndex}`));
            totalMovesToAnalyze += gp.userMoves.length;
        });
        const selectedGamesToProcess = gamesToProcess.filter(gp => gp.userMoves.length > 0);

        console.log(`[SkillAnalysisEngine] Rolling move window: ${totalMovesToAnalyze}/${maxMoves} newest user moves selected.`);

        if (totalMovesToAnalyze === 0) {
            worker.terminate();
            return [];
        }

        // Step 2: Analyze user moves sequentially
        for (const gp of selectedGamesToProcess) {
            const analyzedMistakes = [];
            const allMoveEvaluations = [];

            for (const m of gp.userMoves) {
                // Get evaluation before move (user's turn)
                const resBefore = await getEvaluation(worker, m.fenBefore, depth);
                
                // Stockfish evaluation is relative to the side to move (which is user)
                const evalBeforeUser = gp.userSide === 'white' 
                    ? (m.fenBefore.split(' ')[1] === 'w' ? resBefore.score : -resBefore.score)
                    : (m.fenBefore.split(' ')[1] === 'b' ? resBefore.score : -resBefore.score);

                let evalAfterUser;
                const isBestMove = m.userMove === resBefore.bestMove || m.userMoveUci === resBefore.bestMove;

                if (isBestMove) {
                    evalAfterUser = evalBeforeUser;
                } else {
                    const resAfter = await getEvaluation(worker, m.fenAfter, depth);
                    // After user's move, it is opponent's turn, so invert opponent's evaluation
                    evalAfterUser = gp.userSide === 'white'
                        ? (m.fenAfter.split(' ')[1] === 'w' ? resAfter.score : -resAfter.score)
                        : (m.fenAfter.split(' ')[1] === 'b' ? resAfter.score : -resAfter.score);
                }

                const evalSwing = Math.max(0, evalBeforeUser - evalAfterUser);
                
                let classification = 'best';
                if (isBestMove) {
                    classification = 'best';
                } else if (evalSwing <= 10) {
                    classification = 'best';
                } else if (evalSwing <= 50) {
                    classification = 'good';
                } else if (evalSwing <= 100) {
                    classification = 'inaccuracy';
                } else if (evalSwing <= 200) {
                    classification = 'mistake';
                } else {
                    classification = 'blunder';
                }

                const moveEval = {
                    moveNumber: m.moveNumber,
                    userMove: m.userMove,
                    bestMove: resBefore.bestMove,
                    evalBefore: evalBeforeUser,
                    evalAfter: evalAfterUser,
                    evalSwing: evalSwing,
                    fenBefore: m.fenBefore,
                    classification
                };

                allMoveEvaluations.push(moveEval);

                // Keep only inaccuracies, mistakes, and blunders as mistakes for RAG / profiling
                if (classification === 'inaccuracy' || classification === 'mistake' || classification === 'blunder') {
                    analyzedMistakes.push(moveEval);
                }

                movesAnalyzedCount++;
                if (typeof onProgress === 'function') {
                    onProgress(movesAnalyzedCount, totalMovesToAnalyze);
                }
            }

            gamesResult.push({
                ...gp.game,
                userSide: gp.userSide,
                analyzedMistakes,
                allMoveEvaluations,
                analysisWindow: {
                    maxMoves,
                    movesAnalyzed: allMoveEvaluations.length,
                    rollingWindow: true
                }
            });
        }

        worker.terminate();
        return gamesResult;
    }

    window.skillAnalysisEngine = {
        analyzeUserSkill
    };
})();
