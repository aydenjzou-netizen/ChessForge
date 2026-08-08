const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseConfig } = require('../config/database');
const { PostgresRepository } = require('../storage/postgresRepository');

test('database configuration requires a connection string', () => {
    assert.throws(() => databaseConfig({}), /DATABASE_URL is required/);
});

test('database configuration supports local and Azure connection URLs without rewriting TLS options', () => {
    const azureUrl = 'postgresql://user:secret@example.postgres.database.azure.com/db?sslmode=verify-full';
    const config = databaseConfig({
        DATABASE_URL: azureUrl,
        DB_POOL_SIZE: '7',
        DB_APPLICATION_NAME: 'test-app',
        DB_CONNECT_TIMEOUT_MS: '1234'
    });
    assert.equal(config.connectionString, azureUrl);
    assert.equal(config.max, 7);
    assert.equal(config.application_name, 'test-app');
    assert.equal(config.connectionTimeoutMillis, 1234);
});

test('placeholder user creation explicitly casts a UUID reused in text fields', async () => {
    const calls = [];
    const client = { query: async (sql, values) => { calls.push({ sql, values }); } };
    const repository = new PostgresRepository({ pool: client });
    const userId = '00000000-0000-4000-8000-000000000001';

    await repository.ensureUser(client, userId);

    assert.match(calls[0].sql, /\$1::uuid/);
    assert.match(calls[0].sql, /\$1::text/);
    assert.deepEqual(calls[0].values, [userId]);
});
