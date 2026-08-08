const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveStorageMode } = require('../config/storageMode');
const { createRepository } = require('../storage');

test('storage mode defaults to PostgreSQL and only supports PostgreSQL', () => {
    assert.equal(resolveStorageMode({}), 'postgres');
    assert.equal(resolveStorageMode({ STORAGE_MODE: 'postgres' }), 'postgres');
    assert.equal(resolveStorageMode({ STORAGE_DRIVER: 'postgres' }), 'postgres');
    assert.throws(() => resolveStorageMode({ STORAGE_MODE: 'legacy' }), /requires postgres/);
    assert.throws(() => resolveStorageMode({ STORAGE_DRIVER: 'filesystem' }), /Unsupported STORAGE_DRIVER/);
});

test('storage mode rejects unknown and conflicting configuration', () => {
    assert.throws(
        () => resolveStorageMode({ STORAGE_MODE: 'unknown' }),
        /Unsupported STORAGE_MODE/
    );
    assert.throws(
        () => resolveStorageMode({ STORAGE_MODE: 'legacy', STORAGE_DRIVER: 'postgres' }),
        /requires postgres/
    );
});

test('repository refuses every non-PostgreSQL storage mode', () => {
    const previousMode = process.env.STORAGE_MODE;
    const previousDriver = process.env.STORAGE_DRIVER;
    try {
        process.env.STORAGE_MODE = 'legacy';
        delete process.env.STORAGE_DRIVER;
        assert.throws(
            () => createRepository(),
            /requires postgres/
        );
    } finally {
        if (previousMode === undefined) delete process.env.STORAGE_MODE;
        else process.env.STORAGE_MODE = previousMode;
        if (previousDriver === undefined) delete process.env.STORAGE_DRIVER;
        else process.env.STORAGE_DRIVER = previousDriver;
    }
});
