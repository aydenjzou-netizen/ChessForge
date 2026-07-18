const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3001;
const STORAGE_DIR = path.join(__dirname, 'game-storage');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Helper to ensure storage directory exists
fs.ensureDirSync(STORAGE_DIR);

const {
    convertPgnToAiTextFormat,
    upgradeAiTextFormatWithFens,
    aiTextNeedsFenUpgrade
} = require('./chessTextFormat');

const {
    saveGame,
    readGame,
    listGames,
    replaceLibrary,
    migrateExistingRawFiles
} = require('./gameFileStore');

const {
    analyzeTrainingProfile,
    getTrainingProfile,
    getTrainingPuzzles,
    saveSkillProfile,
    clearSkillProfile
} = require('../server/training/trainingCoach');

/**
 * Extracts metadata from PGN headers.
 */
function extractMetadata(pgn) {
    const metadata = {};
    const regex = /\[(\w+)\s+"(.*?)"\]/g;
    let match;
    while ((match = regex.exec(pgn)) !== null) {
        metadata[match[1]] = match[2];
    }
    return metadata;
}

// POST /api/games - Save a new game
app.post('/api/games', async (req, res) => {
    try {
        const { pgn } = req.body;
        if (!pgn) {
            return res.status(400).json({ error: 'PGN is required' });
        }

        const aiText = convertPgnToAiTextFormat(pgn);
        const metadata = extractMetadata(pgn);
        metadata.id = req.body.id;
        metadata.title = req.body.title || metadata.Event || 'Untitled Game';
        metadata.name = req.body.name || metadata.title;
        metadata.createdAt = req.body.createdAt || new Date().toISOString();
        metadata.headers = req.body.headers || metadata;
        metadata.moveCount = req.body.moveCount;
        metadata.result = req.body.result || metadata.Result || '*';
        metadata.source = req.body.source;
        metadata.chessCom = req.body.chessCom;
        metadata.gameMetadata = req.body.gameMetadata;

        const savedGame = await saveGame(STORAGE_DIR, {
            ...req.body,
            ...metadata,
            pgn,
            aiTextFormat: req.body.aiTextFormat || aiText
        });

        console.log(`--- Game Saved ---`);
        console.log(`ID: ${savedGame.id}`);
        console.log(`storageMode: ${savedGame.compression ? 'gzip archive' : 'raw file'}`);
        console.log(`metadata.json saved`);

        res.status(201).json(savedGame);
    } catch (error) {
        console.error('Error saving game:', error);
        res.status(500).json({ error: 'Failed to save game' });
    }
});

// GET /api/games - List all games
app.get('/api/games', async (req, res) => {
    try {
        res.json(await listGames(STORAGE_DIR));
    } catch (error) {
        console.error('Error listing games:', error);
        res.status(500).json({ error: 'Failed to list games' });
    }
});

// PUT /api/games/library - Replace the filesystem-backed library
app.put('/api/games/library', async (req, res) => {
    try {
        const games = Array.isArray(req.body.games) ? req.body.games : [];
        const saved = await replaceLibrary(STORAGE_DIR, games);
        res.json({ games: saved, count: saved.length });
    } catch (error) {
        console.error('Error replacing game library:', error);
        res.status(500).json({ error: 'Failed to replace game library' });
    }
});

// GET /api/games/:id - Get a single game
app.get('/api/games/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const folderPath = path.join(STORAGE_DIR, id);

        if (!(await fs.pathExists(folderPath))) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const game = await readGame(STORAGE_DIR, id);

        res.json(game);
    } catch (error) {
        console.error('Error getting game:', error);
        res.status(500).json({ error: 'Failed to get game' });
    }
});

// DELETE /api/games/:id - Delete a game
app.delete('/api/games/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const folderPath = path.join(STORAGE_DIR, id);

        if (!(await fs.pathExists(folderPath))) {
            return res.status(404).json({ error: 'Game not found' });
        }

        await fs.remove(folderPath);
        console.log(`--- Game Deleted ---`);
        console.log(`ID: ${id}`);
        
        res.json({ message: 'Game deleted successfully' });
    } catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ error: 'Failed to delete game' });
    }
});

// POST /api/backfill - Migration route
app.post('/api/backfill', async (req, res) => {
    try {
        const folders = await fs.readdir(STORAGE_DIR);
        let scanned = 0;
        let converted = 0;
        let skipped = 0;
        let failed = 0;

        for (const id of folders) {
            const folderPath = path.join(STORAGE_DIR, id);
            const stats = await fs.stat(folderPath);
            if (!stats.isDirectory()) continue;

            scanned++;
            const pgnPath = path.join(folderPath, 'original.pgn');
            const aiPath = path.join(folderPath, 'ai-format.txt');
            const pgnGzipPath = path.join(folderPath, 'original.pgn.gz');
            const aiGzipPath = path.join(folderPath, 'ai-format.txt.gz');

            if (await fs.pathExists(pgnPath) || await fs.pathExists(pgnGzipPath)) {
                let aiExists = await fs.pathExists(aiPath) || await fs.pathExists(aiGzipPath);
                let aiContent = '';
                if (aiExists) {
                    const game = await readGame(STORAGE_DIR, id);
                    aiContent = game.aiTextFormat || '';
                }

                if (!aiExists || aiContent.trim() === '') {
                    try {
                        const game = await readGame(STORAGE_DIR, id);
                        const pgn = game.pgn;
                        const aiText = convertPgnToAiTextFormat(pgn);
                        await saveGame(STORAGE_DIR, { ...game, aiTextFormat: aiText });
                        converted++;
                    } catch (e) {
                        console.error(`Failed to convert game ${id}:`, e);
                        failed++;
                    }
                } else if (aiTextNeedsFenUpgrade(aiContent)) {
                    try {
                        const upgraded = upgradeAiTextFormatWithFens(aiContent);
                        if (upgraded) {
                            const game = await readGame(STORAGE_DIR, id);
                            await saveGame(STORAGE_DIR, { ...game, aiTextFormat: upgraded });
                            converted++;
                        } else {
                            skipped++;
                        }
                    } catch (e) {
                        console.error(`Failed FEN upgrade for game ${id}:`, e);
                        failed++;
                    }
                } else {
                    skipped++;
                }
            } else {
                skipped++;
            }
        }

        console.log(`--- Backfill Complete ---`);
        console.log(`Scanned: ${scanned}, Converted: ${converted}, Skipped: ${skipped}, Failed: ${failed}`);

        res.json({ scanned, converted, skipped, failed });
    } catch (error) {
        console.error('Error in backfill:', error);
        res.status(500).json({ error: 'Backfill failed' });
    }
});

// GET /api/training/profile - Return the current Training Coach profile
app.get('/api/training/profile', (req, res) => {
    res.json(getTrainingProfile());
});

// GET /api/training/skill-profile - Return the current skill profile
app.get('/api/training/skill-profile', (req, res) => {
    res.json(getTrainingProfile());
});

// POST /api/training/skill-profile - Save skill profile from client
app.post('/api/training/skill-profile', (req, res) => {
    try {
        const profile = req.body;
        if (!profile) {
            return res.status(400).json({ error: 'Profile body is required' });
        }
        saveSkillProfile(profile);
        res.json({ message: 'Skill profile saved successfully', profile });
    } catch (err) {
        console.error('[TrainingCoach] Failed to save skill profile:', err);
        res.status(500).json({ error: 'Failed to save skill profile' });
    }
});

// DELETE /api/training/skill-profile - Clear previous Training Coach memory
app.delete('/api/training/skill-profile', (req, res) => {
    try {
        const profile = clearSkillProfile();
        res.json({ message: 'Skill profile cleared', profile });
    } catch (err) {
        console.error('[TrainingCoach] Failed to clear skill profile:', err);
        res.status(500).json({ error: 'Failed to clear skill profile' });
    }
});

// POST /api/training/analyze - Analyze recent saved games and rebuild profile
app.post('/api/training/analyze', async (req, res) => {
    try {
        const games = Array.isArray(req.body.games) ? req.body.games : [];
        const excludeIds = Array.isArray(req.body.excludeIds) ? req.body.excludeIds : [];
        const profile = await analyzeTrainingProfile(games, { mistakeThreshold: 1.5, excludeIds });
        res.json(profile);
    } catch (error) {
        console.error('[TrainingCoach] Analyze failed:', error);
        res.status(500).json({ error: 'Failed to analyze training profile' });
    }
});

// GET /api/training/puzzles?theme=fork - Return puzzles matching a theme
app.get('/api/training/puzzles', (req, res) => {
    try {
        const result = getTrainingPuzzles(req.query.theme, {
            targetRating: req.query.rating,
            level: req.query.level,
            boss: req.query.boss === '1' || req.query.boss === 'true',
            excludeIds: String(req.query.exclude || '').split(',').map(id => id.trim()).filter(Boolean)
        });
        res.json(result);
    } catch (error) {
        console.error('[TrainingCoach] Puzzle retrieval failed:', error);
        res.status(500).json({ error: 'Failed to retrieve training puzzles' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);

    (async () => {
        try {
            const migrated = await migrateExistingRawFiles(STORAGE_DIR);
            if (migrated > 0) {
                console.log(`[FileGameStore] Startup compression migration: ${migrated} game(s).`);
            }
        } catch (e) {
            console.warn('[FileGameStore] Startup compression migration failed:', e.message);
        }
    })();
});
