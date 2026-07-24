const fs = require('fs-extra');
const path = require('path');
const { validate: isUuid } = require('uuid');
const { createRepository } = require('../storage');

const DEFAULT_USER_ID = process.env.LOCAL_USER_ID || '00000000-0000-4000-8000-000000000001';

async function main() {
    const userId = process.env.MIGRATION_USER_ID || DEFAULT_USER_ID;
    if (!isUuid(userId)) throw new Error('MIGRATION_USER_ID must be a UUID.');
    const legacyDir = process.env.LEGACY_STORAGE_DIR || path.join(__dirname, '..', 'game-storage');
    const repository = createRepository();
    await repository.initialize();
    const stats = { scanned: 0, imported: 0, skipped: 0, failed: 0 };
    try {
        for (const entry of await fs.readdir(legacyDir)) {
            const metadataPath = path.join(legacyDir, entry, 'metadata.json');
            if (!(await fs.pathExists(metadataPath))) continue;
            stats.scanned++;
            try {
                const game = await fs.readJson(metadataPath);
                if (await repository.readGame(userId, game.id)) { stats.skipped++; continue; }
                await repository.saveGame(userId, game);
                stats.imported++;
            } catch (error) { console.error(`failed ${entry}: ${error.message}`); stats.failed++; }
        }
        const profileCandidates = ['skill-profile.json', 'skill-profile 2.json', 'skill-profile 3.json'];
        for (const name of profileCandidates) {
            const candidate = path.join(legacyDir, name);
            if (await fs.pathExists(candidate)) {
                const profile = await fs.readJson(candidate);
                await repository.saveTrainingProfile(userId, profile);
                console.log(`training profile imported from ${name}`);
                break;
            }
        }
        console.log(JSON.stringify(stats, null, 2));
        if (stats.failed) process.exitCode = 1;
    } finally { await repository.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
