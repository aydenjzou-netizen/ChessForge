const { Pool } = require('pg');

function databaseConfig(env = process.env, overrides = {}) {
    const connectionString = overrides.connectionString || env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required.');

    return {
        connectionString,
        application_name: env.DB_APPLICATION_NAME || 'chessforge',
        max: Number(env.DB_POOL_SIZE || 10),
        connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS || 10000),
        idleTimeoutMillis: Number(env.DB_IDLE_TIMEOUT_MS || 30000),
        ...overrides,
        connectionString
    };
}

function createPool(options = {}) {
    const { env, ...overrides } = options;
    return new Pool(databaseConfig(env, overrides));
}

module.exports = { databaseConfig, createPool };
