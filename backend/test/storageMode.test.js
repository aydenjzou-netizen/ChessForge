const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveStorageMode } = require('../config/storageMode');
const { createRepository } = require('../storage');

test('storage mode defaults to legacy and supports the compatibility driver', () => {
    assert.equal(resolveStorageMode({}), 'legacy');
    assert.equal(resolveStorageMode({ STORAGE_MODE: 'legacy' }), 'legacy');
    assert.equal(resolveStorageMode({ STORAGE_DRIVER: 'filesystem' }), 'legacy');
    assert.equal(resolveStorageMode({ STORAGE_MODE: 'postgres' }), 'postgres');
    assert.equal(resolveStorageMode({ STORAGE_DRIVER: 'postgres' }), 'postgres');
});

test('storage mode rejects unknown and conflicting configuration', () => {
    assert.throws(
        () => resolveStorageMode({ STORAGE_MODE: 'unknown' }),
        /Unsupported STORAGE_MODE/
    );
    assert.throws(
        () => resolveStorageMode({ STORAGE_MODE: 'legacy', STORAGE_DRIVER: 'postgres' }),
        /conflicts/
    );
});

test('dual-write is explicitly unavailable until Phase 2', () => {
    const previousMode = process.env.STORAGE_MODE;
    const previousDriver = process.env.STORAGE_DRIVER;
    try {
        process.env.STORAGE_MODE = 'dual-write';
        delete process.env.STORAGE_DRIVER;
        assert.throws(
            () => createRepository(),
            /reserved for the controlled Phase 2 migration/
        );
    } finally {
        if (previousMode === undefined) delete process.env.STORAGE_MODE;
        else process.env.STORAGE_MODE = previousMode;
        if (previousDriver === undefined) delete process.env.STORAGE_DRIVER;
        else process.env.STORAGE_DRIVER = previousDriver;
    }
});
