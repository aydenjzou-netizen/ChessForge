const fs = require('fs-extra');
const path = require('path');
const { canonicalGame, apiGame } = require('./gameModel');

const LIBRARY_LIMIT = 750;

function safePart(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

class LocalRepository {
    constructor(rootDir) {
        this.rootDir = rootDir;
    }

    userDir(userId) { return path.join(this.rootDir, 'users', safePart(userId)); }
    gamesDir(userId) { return path.join(this.userDir(userId), 'games'); }
    gamePath(userId, gameId) { return path.join(this.gamesDir(userId), `${safePart(gameId)}.json`); }
    profilePath(userId) { return path.join(this.userDir(userId), 'training-profile.json'); }

    async initialize() { await fs.ensureDir(path.join(this.rootDir, 'users')); }

    async saveGame(userId, input) {
        const existing = input.id ? await this.readCanonicalGame(userId, input.id) : null;
        const hasIncomingPgn = Boolean(input && (input.pgn || input.rawPGN));
        const game = canonicalGame({
            ...existing,
            ...input,
            pgn: hasIncomingPgn ? (input.pgn || input.rawPGN) : (existing && existing.pgn),
            aiText: input.aiText || input.aiTextFormat || (existing && existing.aiText),
            createdAt: existing && existing.createdAt
        });
        await fs.ensureDir(this.gamesDir(userId));
        await fs.writeJson(this.gamePath(userId, game.id), game, { spaces: 2 });
        return apiGame(game);
    }

    async readCanonicalGame(userId, gameId) {
        try { return await fs.readJson(this.gamePath(userId, gameId)); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }

    async readGame(userId, gameId) { return apiGame(await this.readCanonicalGame(userId, gameId)); }

    async listGames(userId) {
        await fs.ensureDir(this.gamesDir(userId));
        const names = (await fs.readdir(this.gamesDir(userId))).filter(name => name.endsWith('.json'));
        const games = [];
        for (const name of names) games.push(await fs.readJson(path.join(this.gamesDir(userId), name)));
        games.sort((a, b) => String(b.playedAt || b.createdAt).localeCompare(String(a.playedAt || a.createdAt)));
        return games.slice(0, LIBRARY_LIMIT).map(apiGame);
    }

    async deleteGame(userId, gameId) {
        const target = this.gamePath(userId, gameId);
        if (!(await fs.pathExists(target))) return false;
        await fs.remove(target);
        return true;
    }

    async replaceLibrary(userId, inputs) {
        const games = [];
        for (const input of (Array.isArray(inputs) ? inputs : []).slice(0, LIBRARY_LIMIT)) {
            const existing = input && input.id ? await this.readCanonicalGame(userId, input.id) : null;
            games.push(canonicalGame({
                ...existing,
                ...input,
                pgn: (input && (input.pgn || input.rawPGN)) || (existing && existing.pgn),
                aiText: (input && (input.aiText || input.aiTextFormat)) || (existing && existing.aiText),
                createdAt: existing && existing.createdAt
            }));
        }
        const userDir = this.userDir(userId);
        const destination = this.gamesDir(userId);
        const staged = path.join(userDir, `.games-stage-${Date.now()}`);
        await fs.ensureDir(staged);
        try {
            for (const game of games) await fs.writeJson(path.join(staged, `${safePart(game.id)}.json`), game, { spaces: 2 });
            const previous = `${destination}.previous`;
            await fs.remove(previous);
            if (await fs.pathExists(destination)) await fs.move(destination, previous);
            await fs.move(staged, destination);
            await fs.remove(previous);
        } catch (error) {
            await fs.remove(staged);
            throw error;
        }
        return games.map(apiGame);
    }

    async getTrainingProfile(userId) {
        try { return await fs.readJson(this.profilePath(userId)); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }

    async saveTrainingProfile(userId, profile) {
        const record = { ...profile, userId, updatedAt: new Date().toISOString() };
        await fs.ensureDir(this.userDir(userId));
        await fs.writeJson(this.profilePath(userId), record, { spaces: 2 });
        return record;
    }

    async clearTrainingProfile(userId) {
        await fs.remove(this.profilePath(userId));
        return true;
    }

    async healthCheck() { return { storage: 'filesystem', ok: true }; }
    async close() {}
}

module.exports = { LocalRepository, LIBRARY_LIMIT };
