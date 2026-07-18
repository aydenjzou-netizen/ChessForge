/**
 * EngineAdapter provides a clean interface for interacting with Stockfish.
 * Uses locally-hosted Stockfish WASM/JS files served from the static directory.
 */
class EngineAdapter {
    constructor() {
        this.stockfish = null;
        this.onBestMove = null;
        this.isReady = false;
        this.initPromise = null;
        this.defaultElo = 800;
        this.activeElo = this.defaultElo;
        this.readyResolvers = [];
        this.engineOptions = new Set();
        this.moveTimeMs = 40;
        this.difficultySettings = {
            easy:   { depth: 2,  moveTime: 300,  skill: 0  },
            medium: { depth: 8,  moveTime: 1000, skill: 10 },
            hard:   { depth: 15, moveTime: 3000, skill: 20 }
        };
    }

    normalizeElo(elo) {
        const parsed = Number.parseInt(elo, 10);
        if (!Number.isFinite(parsed)) return this.defaultElo;
        return Math.min(2500, Math.max(100, parsed));
    }

    sendCommand(command) {
        if (!this.stockfish) return;
        console.log(`[Engine][UCI] ${command}`);
        this.stockfish.postMessage(command);
    }

    waitUntilReady() {
        if (!this.stockfish || !this.isReady) {
            return Promise.reject(new Error('Engine is not ready'));
        }

        return new Promise((resolve, reject) => {
            const entry = {
                resolve: () => {
                    clearTimeout(timeout);
                    resolve();
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            };
            const timeout = setTimeout(() => {
                this.readyResolvers = this.readyResolvers.filter(item => item !== entry);
                reject(new Error('Engine did not respond to isready'));
            }, 5000);

            this.readyResolvers.push(entry);

            this.sendCommand('isready');
        });
    }

    setElo(elo) {
        this.activeElo = this.normalizeElo(elo);
        console.log(`[Engine] Active Stockfish Elo set to ${this.activeElo}`);
        return this.activeElo;
    }

    eloToSkillLevel(elo) {
        const selectedElo = this.normalizeElo(elo);
        return Math.min(20, Math.max(0, Math.round(((selectedElo - 100) / 2400) * 20)));
    }

    supportsOption(optionName) {
        return this.engineOptions.has(String(optionName).toLowerCase());
    }

    rememberEngineOption(message) {
        const match = message.match(/^option name\s+(.+?)\s+type\s+/i);
        if (!match) return;
        const optionName = match[1].trim();
        this.engineOptions.add(optionName.toLowerCase());
        console.log(`[Engine] Supports option: ${optionName}`);
    }

    async applyElo(elo = this.activeElo) {
        const selectedElo = this.setElo(elo);
        if (!this.stockfish || !this.isReady) {
            console.log(`[Engine] Elo ${selectedElo} stored; will apply when Stockfish is ready.`);
            return selectedElo;
        }

        if (this.supportsOption('UCI_LimitStrength') && this.supportsOption('UCI_Elo')) {
            this.sendCommand('setoption name UCI_LimitStrength value true');
            this.sendCommand(`setoption name UCI_Elo value ${selectedElo}`);
        } else if (this.supportsOption('Skill Level')) {
            const skillLevel = this.eloToSkillLevel(selectedElo);
            console.warn(`[Engine] UCI_Elo/UCI_LimitStrength not advertised by this Stockfish build; using Skill Level ${skillLevel}/20 for requested ${selectedElo} Elo.`);
            this.sendCommand(`setoption name Skill Level value ${skillLevel}`);
        } else {
            console.warn('[Engine] No supported strength-limiting option was advertised; Stockfish may play at full strength.');
        }

        await this.waitUntilReady();
        console.log(`[Engine] Stockfish strength confirmed for requested ${selectedElo} Elo`);
        return selectedElo;
    }

    initializeEngine() {
        // Prevent multiple simultaneous init calls
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            try {
                // Detect WASM support for best performance
                const wasmSupported = typeof WebAssembly === 'object' &&
                    WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));

                const workerPath = wasmSupported ? 'stockfish.wasm.js' : 'stockfish.js';
                console.log(`[Engine] Loading ${workerPath} (WASM: ${wasmSupported})`);

                this.stockfish = new Worker(workerPath);

                // Set a timeout in case the engine never responds
                const timeout = setTimeout(() => {
                    if (!this.isReady) {
                        console.error("[Engine] Initialization timed out after 15s");
                        this.initPromise = null;
                        reject(new Error("Engine initialization timed out"));
                    }
                }, 15000);

                this.stockfish.onmessage = (event) => {
                    const message = typeof event.data === 'string' ? event.data : '';

                    if (message.startsWith('option name ')) {
                        this.rememberEngineOption(message);
                    }

                    if (message === 'uciok') {
                        this.isReady = true;
                        clearTimeout(timeout);
                        console.log("[Engine] Ready (uciok received)");
                        this.applyElo(this.activeElo)
                            .then(() => resolve())
                            .catch(err => {
                                console.error('[Engine] Failed to apply Elo after initialization:', err);
                                this.initPromise = null;
                                reject(err);
                            });
                    }

                    if (message === 'readyok') {
                        const resolvers = this.readyResolvers.splice(0);
                        resolvers.forEach(item => item.resolve());
                    }

                    if (message.startsWith('bestmove')) {
                        const parts = message.split(' ');
                        const bestMove = parts[1];
                        if (bestMove && this.onBestMove) {
                            this.onBestMove(bestMove);
                        }
                    }
                };

                this.stockfish.onerror = (err) => {
                    console.error("[Engine] Worker error:", err);
                    clearTimeout(timeout);
                    this.initPromise = null;
                    reject(err);
                };

                this.sendCommand('uci');
            } catch (err) {
                console.error("[Engine] Failed to create worker:", err);
                this.initPromise = null;
                reject(err);
            }
        });

        return this.initPromise;
    }

    async startNewGame(elo = this.activeElo) {
        if (!this.isReady || !this.stockfish) {
            console.error("[Engine] Not ready, cannot start new engine game.");
            return;
        }

        this.sendCommand('stop');
        this.sendCommand('ucinewgame');
        await this.applyElo(elo);
    }

    async getBestMove(fen, elo = this.activeElo) {
        if (!this.isReady || !this.stockfish) {
            console.error("[Engine] Not ready, cannot get best move.");
            return;
        }

        const selectedElo = this.normalizeElo(elo);
        this.sendCommand('stop');
        await this.applyElo(selectedElo);
        this.sendCommand(`position fen ${fen}`);
        console.log(`[Engine] Starting Stockfish search at ${selectedElo} Elo with ${this.moveTimeMs}ms movetime cap`);
        this.sendCommand(`go movetime ${this.moveTimeMs}`);
    }

    stopEngine() {
        if (this.stockfish) {
            this.sendCommand('stop');
            this.stockfish.terminate();
            this.stockfish = null;
            this.isReady = false;
            this.initPromise = null;
            this.readyResolvers.splice(0).forEach(item => item.reject(new Error('Engine stopped')));
        }
    }
}

// Global instance
window.engineAdapter = new EngineAdapter();
