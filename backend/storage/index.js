const { resolveStorageMode } = require('../config/storageMode');

function createRepository() {
    resolveStorageMode();
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. ChessForge only uses PostgreSQL.');
    const { PostgresRepository } = require('./postgresRepository');
    return new PostgresRepository();
}

module.exports = { createRepository };
