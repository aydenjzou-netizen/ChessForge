/**
 * PlayComputer handles the logic for playing against Stockfish.
 */
class PlayComputer {
    constructor() {
        this.eloStorageKey = 'play_computer_stockfish_elo';
        this.defaultElo = 800;
        this.board = null;
        this.game = new Chess();
        this.playerColor = 'white';
        this.elo = this.readSavedElo();
        this.playerName = 'Player';
        this.computerName = 'Stockfish';
        this.isGameOver = false;
        
        // DOM Elements
        this.view = document.getElementById('playComputerView');
        this.boardEl = document.getElementById('playComputerBoard');
        this.statusEl = document.getElementById('gameStatus');
        this.moveListEl = document.getElementById('playComputerMoveList');
        this.setupModal = document.getElementById('playerSetupModal');
        
        this.initEventListeners();
        this.syncEloUi(this.elo);
        if (window.engineAdapter && typeof window.engineAdapter.setElo === 'function') {
            window.engineAdapter.setElo(this.elo);
        }
    }

    normalizeElo(elo) {
        const parsed = Number.parseInt(elo, 10);
        if (!Number.isFinite(parsed)) return this.defaultElo;
        return Math.min(2500, Math.max(100, parsed));
    }

    readSavedElo() {
        try {
            return this.normalizeElo(localStorage.getItem(this.eloStorageKey));
        } catch (err) {
            return this.defaultElo;
        }
    }

    saveElo(elo) {
        try {
            localStorage.setItem(this.eloStorageKey, String(elo));
        } catch (err) {
            console.warn('[PlayComputer] Could not persist Stockfish Elo:', err);
        }
    }

    getEloLabel(elo) {
        if (elo >= 2000) return 'Expert';
        if (elo >= 1500) return 'Strong';
        if (elo >= 850) return 'Medium';
        return 'Beginner';
    }

    syncEloUi(elo) {
        const selectedElo = this.normalizeElo(elo);
        const eloSlider = document.getElementById('psEloSlider');
        const eloLabel = document.getElementById('psEloLabel');

        if (eloSlider) {
            eloSlider.value = String(selectedElo);
            eloSlider.setAttribute('aria-valuetext', `${selectedElo} Elo`);
        }

        if (eloLabel) {
            eloLabel.innerText = `Computer Strength: ${selectedElo} Elo — ${this.getEloLabel(selectedElo)} (active)`;
        }
    }

    setSelectedElo(elo, { applyToEngine = true } = {}) {
        const selectedElo = this.normalizeElo(elo);
        this.elo = selectedElo;
        this.computerName = `Stockfish ${selectedElo}`;
        this.saveElo(selectedElo);
        this.syncEloUi(selectedElo);
        console.log(`[PlayComputer] Selected Stockfish Elo: ${selectedElo}`);

        if (applyToEngine && window.engineAdapter) {
            if (typeof window.engineAdapter.setElo === 'function') {
                window.engineAdapter.setElo(selectedElo);
            }
            if (window.engineAdapter.isReady && typeof window.engineAdapter.applyElo === 'function') {
                window.engineAdapter.applyElo(selectedElo).catch(err => {
                    console.error('[PlayComputer] Failed to apply selected Stockfish Elo:', err);
                });
            }
        }

        return selectedElo;
    }

    initEventListeners() {
        document.getElementById('btnPlayComputer').addEventListener('click', () => {
            if (typeof window.navigateToRoute === 'function') {
                window.navigateToRoute('/play-computer');
            }
            this.showSetup();
        });
        document.getElementById('btnBackFromPlay').addEventListener('click', () => {
            if (typeof window.navigateToRoute === 'function') {
                window.navigateToRoute('/');
            } else {
                this.showHome();
            }
        });
        document.getElementById('btnCancelSetup').addEventListener('click', () => this.hideSetup());
        document.getElementById('btnStartGame').addEventListener('click', () => this.startGame());
        document.getElementById('btnNewGameComputer').addEventListener('click', () => this.showSetup());
        document.getElementById('btnResignComputer').addEventListener('click', () => this.resign());
        document.getElementById('btnSaveComputerGame').addEventListener('click', () => this.saveGame());

        const eloSlider = document.getElementById('psEloSlider');
        if (eloSlider) {
            eloSlider.addEventListener('input', (e) => {
                this.setSelectedElo(e.target.value);
            });
        }
    }

    showSetup() {
        this.syncEloUi(this.elo);
        this.setupModal.style.display = 'flex';
    }

    hideSetup() {
        this.setupModal.style.display = 'none';
        // If there is no active computer game yet, cancelling setup returns to the library.
        if (this.view.style.display === 'none' || (typeof window.navigateToRoute === 'function' && !this.board)) {
            if (typeof window.navigateToRoute === 'function') {
                window.navigateToRoute('/');
                return;
            }
            document.getElementById('homeView').style.display = 'block';
        }
    }

    showHome() {
        if (typeof window.navigateToRoute === 'function') {
            window.navigateToRoute('/');
            return;
        }
        this.view.style.display = 'none';
        document.getElementById('homeView').style.display = 'block';
        if (typeof renderGameLibrary === 'function') renderGameLibrary();
    }

    async startGame() {
        this.playerName = document.getElementById('psName').value.trim() || 'Player';
        this.playerColor = document.getElementById('psColor').value;
        this.setSelectedElo(document.getElementById('psEloSlider').value, { applyToEngine: false });
        
        if (this.playerColor === 'random') {
            this.playerColor = Math.random() < 0.5 ? 'white' : 'black';
        }

        this.hideSetup();
        this.view.style.display = 'block';
        document.getElementById('homeView').style.display = 'none';
        document.getElementById('analysisView').style.display = 'none';
        document.getElementById('createGameView').style.display = 'none';

        this.game = new Chess();
        this.isGameOver = false;
        this.initBoard();
        this.updateStatus();
        this.renderMoveList();

        // Initialize engine if not already done
        if (!window.engineAdapter.isReady) {
            this.statusEl.innerText = "Initializing engine...";
            try {
                await window.engineAdapter.initializeEngine();
            } catch (err) {
                this.statusEl.innerText = "Error: Failed to load engine.";
                return;
            }
        }

        try {
            if (typeof window.engineAdapter.startNewGame === 'function') {
                await window.engineAdapter.startNewGame(this.elo);
            } else if (typeof window.engineAdapter.applyElo === 'function') {
                await window.engineAdapter.applyElo(this.elo);
            }
        } catch (err) {
            console.error('[PlayComputer] Failed to configure Stockfish Elo:', err);
            this.statusEl.innerText = "Error: Failed to configure engine strength.";
            return;
        }

        window.engineAdapter.onBestMove = (move) => this.makeEngineMove(move);

        if (this.playerColor === 'black') {
            this.makeEngineCall();
        }
    }

    initBoard() {
        const onDrop = (source, target) => {
            if (this.isGameOver) return 'snapback';
            if (this.game.turn() !== this.playerColor[0]) return 'snapback';

            const move = this.game.move({
                from: source,
                to: target,
                promotion: 'q' // Always promote to queen for simplicity
            });

            if (move === null) return 'snapback';

            this.onMoveEnd();
        };

        const config = {
            draggable: true,
            position: 'start',
            orientation: this.playerColor,
            onDrop: onDrop,
            onSnapEnd: () => this.board.position(this.game.fen()),
            pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
        };

        this.board = Chessboard('playComputerBoard', config);
    }

    onMoveEnd() {
        this.updateStatus();
        this.renderMoveList();
        this.checkGameOver();

        if (!this.isGameOver && this.game.turn() !== this.playerColor[0]) {
            this.makeEngineCall();
        }
    }

    async makeEngineCall() {
        this.statusEl.innerText = "Computer is thinking...";
        console.log(`[PlayComputer] Requesting Stockfish move at ${this.elo} Elo`);
        try {
            await window.engineAdapter.getBestMove(this.game.fen(), this.elo);
        } catch (err) {
            console.error('[PlayComputer] Failed to start Stockfish calculation:', err);
            this.statusEl.innerText = "Error: Failed to start engine calculation.";
        }
    }

    makeEngineMove(bestMove) {
        if (this.isGameOver) return;

        const move = this.game.move({
            from: bestMove.substring(0, 2),
            to: bestMove.substring(2, 4),
            promotion: bestMove.length === 5 ? bestMove.substring(4, 5) : 'q'
        });

        if (move === null) {
            console.error("Engine returned illegal move:", bestMove);
            this.statusEl.innerText = "Error: Engine returned illegal move.";
            return;
        }

        this.board.position(this.game.fen());
        this.updateStatus();
        this.renderMoveList();
        this.checkGameOver();
    }

    updateStatus() {
        let status = '';
        const moveColor = (this.game.turn() === 'w') ? 'White' : 'Black';

        if (this.game.in_checkmate()) {
            status = 'Checkmate! ' + (this.game.turn() === 'w' ? 'Black' : 'White') + ' wins.';
            this.isGameOver = true;
        } else if (this.game.in_draw()) {
            if (this.game.in_stalemate()) {
                status = 'Draw (Stalemate)';
            } else if (this.game.in_threefold_repetition()) {
                status = 'Draw (Threefold Repetition)';
            } else if (this.game.insufficient_material()) {
                status = 'Draw (Insufficient Material)';
            } else {
                status = 'Draw';
            }
            this.isGameOver = true;
        } else {
            status = moveColor + ' to move';
            if (this.game.in_check()) {
                status += ' (Check!)';
            }
        }

        this.statusEl.innerText = status;
    }

    checkGameOver() {
        if (this.game.game_over()) {
            this.isGameOver = true;
            document.getElementById('btnResignComputer').disabled = true;
        } else {
            document.getElementById('btnResignComputer').disabled = false;
        }
    }

    renderMoveList() {
        this.moveListEl.innerHTML = '';
        const history = this.game.history();

        if (history.length === 0) {
            this.moveListEl.innerHTML = '<div class="empty-state">Make a move to start.</div>';
            return;
        }

        let currentPair = null;
        for (let i = 0; i < history.length; i++) {
            if (i % 2 === 0) {
                currentPair = document.createElement('div');
                currentPair.className = 'move-pair';

                const moveNum = document.createElement('div');
                moveNum.className = 'move-number';
                moveNum.innerText = `${Math.floor(i / 2) + 1}.`;
                currentPair.appendChild(moveNum);

                this.moveListEl.appendChild(currentPair);
            }

            const moveItem = document.createElement('div');
            moveItem.className = 'move-item';
            moveItem.innerText = history[i];
            currentPair.appendChild(moveItem);
        }
        this.moveListEl.scrollTop = this.moveListEl.scrollHeight;
    }

    resign() {
        if (this.isGameOver) return;
        if (!confirm("Are you sure you want to resign?")) return;

        this.isGameOver = true;
        const result = this.playerColor === 'white' ? '0-1' : '1-0';
        this.statusEl.innerText = `Game over, ${this.playerName} resigned. ${result}`;
        
        // Add resignation comment to PGN
        const comment = `${this.playerName} resigned`;
        // In chess.js 0.10.3, adding comments is a bit tricky, but we can handle it during PGN generation if needed
        // For now, we'll just set the result in the headers.

        this.updateStatus(); // This will refresh UI
        this.statusEl.innerText = `Game over, ${this.playerName} resigned. ${result}`;
        this.checkGameOver();
    }

    async saveGame() {
        if (this.game.history().length === 0) {
            alert("No moves to save.");
            return;
        }

        let result = '*';
        if (this.game.in_checkmate()) {
            result = this.game.turn() === 'w' ? '0-1' : '1-0';
        } else if (this.game.in_draw()) {
            result = '1/2-1/2';
        } else if (this.isGameOver) {
            // Resigned
            result = this.playerColor === 'white' ? '0-1' : '1-0';
        }

        const now = new Date();
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

        this.game.header('Event', 'Computer Game');
        this.game.header('Site', 'Local');
        this.game.header('Date', dateStr);
        this.game.header('Round', '-');
        this.game.header('White', this.playerColor === 'white' ? this.playerName : this.computerName);
        this.game.header('Black', this.playerColor === 'black' ? this.playerName : this.computerName);
        this.game.header('Result', result);

        const pgn = this.game.pgn();
        if (typeof saveGameToStorage === 'function') {
            const saved = await saveGameToStorage(pgn);
            if (saved) {
                alert("Game saved to library!");
                this.showHome();
            }
        } else {
            console.error("saveGameToStorage function not found.");
        }
    }
}

// Global instance
window.playComputer = new PlayComputer();
