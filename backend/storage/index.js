const path = require('path');
const { LocalRepository } = require('./localRepository');
const { resolveStorageMode } = require('../config/storageMode');

function createRepository() {
    const mode = resolveStorageMode();
    if (mode === 'postgres') {
        if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required when STORAGE_MODE=postgres.');
        const { PostgresRepository } = require('./postgresRepository');
        return new PostgresRepository();
    }
    if (mode === 'dual-write') {
        throw new Error('STORAGE_MODE=dual-write is reserved for the controlled Phase 2 migration and is not enabled in Phase 0.');
    }
    return new LocalRepository(process.env.LOCAL_STORAGE_DIR || path.join(__dirname, '..', 'app-data'));
}

module.exports = { createRepository };
