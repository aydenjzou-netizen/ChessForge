const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { validate: isUuid } = require('uuid');
const { createRepository } = require('./storage');
const { convertPgnToAiTextFormat, upgradeAiTextFormatWithFens, aiTextNeedsFenUpgrade } = require('./chessTextFormat');
const { analyzeTrainingProfile, getTrainingPuzzles, createEmptyProfile } = require('../server/training/trainingCoach');
const { logger, requestContext } = require('./observability/logger');
const { resolveStorageMode } = require('./config/storageMode');

const app = express();
const repository = createRepository();
const PORT = Number(process.env.PORT || 3001);
const DEFAULT_LOCAL_USER_ID = process.env.LOCAL_USER_ID || '00000000-0000-4000-8000-000000000001';

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(requestContext);
app.use((req, res, next) => {
    // Temporary bridge: replace x-user-id with a verified auth token before public launch.
    const userId = req.get('x-user-id') || (process.env.NODE_ENV === 'production' ? null : DEFAULT_LOCAL_USER_ID);
    if (!userId || !isUuid(userId)) return res.status(401).json({ error: 'Authenticated user is required' });
    req.user = { id: userId };
    next();
});

function extractMetadata(pgn) {
    const metadata = {};
    const regex = /\[(\w+)\s+"(.*?)"\]/g;
    let match;
    while ((match = regex.exec(pgn)) !== null) metadata[match[1]] = match[2];
    return metadata;
}

app.post('/api/games', async (req, res) => {
    try {
        if (!req.body.pgn) return res.status(400).json({ error: 'PGN is required' });
        const headers = { ...extractMetadata(req.body.pgn), ...(req.body.headers || {}) };
        const game = await repository.saveGame(req.user.id, {
            ...req.body,
            headers,
            title: req.body.title || headers.Event || 'Untitled Game',
            result: req.body.result || headers.Result || '*',
            aiTextFormat: req.body.aiTextFormat || convertPgnToAiTextFormat(req.body.pgn)
        });
        res.status(201).json(game);
    } catch (error) {
        logger.error('game.save.failed', { requestId: req.requestId, userId: req.user.id, error });
        res.status(500).json({ error: 'Failed to save game' });
    }
});

app.get('/api/games', async (req, res) => {
    try { res.json(await repository.listGames(req.user.id)); }
    catch (error) { logger.error('game.list.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to list games' }); }
});

app.put('/api/games/library', async (req, res) => {
    try {
        const games = await repository.replaceLibrary(req.user.id, Array.isArray(req.body.games) ? req.body.games : []);
        res.json({ games, count: games.length });
    } catch (error) { logger.error('game.library.replace.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to replace game library' }); }
});

app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await repository.readGame(req.user.id, req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });
        res.json(game);
    } catch (error) { logger.error('game.read.failed', { requestId: req.requestId, userId: req.user.id, gameId: req.params.id, error }); res.status(500).json({ error: 'Failed to get game' }); }
});

app.delete('/api/games/:id', async (req, res) => {
    try {
        if (!(await repository.deleteGame(req.user.id, req.params.id))) return res.status(404).json({ error: 'Game not found' });
        res.json({ message: 'Game deleted successfully' });
    } catch (error) { logger.error('game.delete.failed', { requestId: req.requestId, userId: req.user.id, gameId: req.params.id, error }); res.status(500).json({ error: 'Failed to delete game' }); }
});

app.post('/api/backfill', async (req, res) => {
    const stats = { scanned: 0, converted: 0, skipped: 0, failed: 0 };
    try {
        for (const game of await repository.listGames(req.user.id)) {
            stats.scanned++;
            if (!game.pgn) { stats.skipped++; continue; }
            try {
                const current = game.aiTextFormat || '';
                const next = !current.trim() ? convertPgnToAiTextFormat(game.pgn)
                    : (aiTextNeedsFenUpgrade(current) ? upgradeAiTextFormatWithFens(current) : null);
                if (!next) { stats.skipped++; continue; }
                await repository.saveGame(req.user.id, { ...game, aiTextFormat: next });
                stats.converted++;
            } catch (error) { logger.error('game.backfill.item.failed', { requestId: req.requestId, userId: req.user.id, gameId: game.id, error }); stats.failed++; }
        }
        res.json(stats);
    } catch (error) { logger.error('game.backfill.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Backfill failed' }); }
});

async function readProfile(userId) { return await repository.getTrainingProfile(userId) || createEmptyProfile(); }
app.get(['/api/training/profile', '/api/training/skill-profile'], async (req, res) => res.json(await readProfile(req.user.id)));

app.post('/api/training/skill-profile', async (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ error: 'Profile body is required' });
        const profile = await repository.saveTrainingProfile(req.user.id, req.body);
        res.json({ message: 'Skill profile saved successfully', profile });
    } catch (error) { logger.error('training.profile.save.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to save skill profile' }); }
});

app.delete('/api/training/skill-profile', async (req, res) => {
    try {
        await repository.clearTrainingProfile(req.user.id);
        res.json({ message: 'Skill profile cleared', profile: createEmptyProfile() });
    } catch (error) { logger.error('training.profile.clear.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to clear skill profile' }); }
});

app.post('/api/training/analyze', async (req, res) => {
    try {
        const profile = await analyzeTrainingProfile(Array.isArray(req.body.games) ? req.body.games : [], {
            mistakeThreshold: 1.5,
            excludeIds: Array.isArray(req.body.excludeIds) ? req.body.excludeIds : []
        });
        res.json(await repository.saveTrainingProfile(req.user.id, profile));
    } catch (error) { logger.error('training.analysis.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to analyze training profile' }); }
});

app.get('/api/training/puzzles', async (req, res) => {
    try {
        res.json(getTrainingPuzzles(req.query.theme, {
            targetRating: req.query.rating,
            level: req.query.level,
            boss: req.query.boss === '1' || req.query.boss === 'true',
            excludeIds: String(req.query.exclude || '').split(',').map(id => id.trim()).filter(Boolean),
            profile: await readProfile(req.user.id)
        }));
    } catch (error) { logger.error('training.puzzles.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to retrieve training puzzles' }); }
});

app.get('/api/health', async (req, res) => res.json(await repository.healthCheck()));

repository.initialize().then(() => {
    app.listen(PORT, () => logger.info('service.started', {
        port: PORT,
        storageMode: resolveStorageMode(),
        environment: process.env.NODE_ENV || 'development'
    }));
}).catch(error => {
    logger.error('storage.initialization.failed', { storageMode: process.env.STORAGE_MODE, error });
    process.exitCode = 1;
});
