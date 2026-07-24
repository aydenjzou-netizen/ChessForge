const VALID_STORAGE_MODES = new Set(['legacy', 'dual-write', 'postgres']);

function normalizeLegacyDriver(driver) {
    const value = String(driver || '').trim().toLowerCase();
    if (!value) return null;
    if (value === 'filesystem') return 'legacy';
    if (value === 'postgres') return 'postgres';
    throw new Error(`Unsupported STORAGE_DRIVER: ${value}`);
}

function resolveStorageMode(env = process.env) {
    const explicitMode = String(env.STORAGE_MODE || '').trim().toLowerCase();
    const legacyMode = normalizeLegacyDriver(env.STORAGE_DRIVER);
    const mode = explicitMode || legacyMode || 'legacy';

    if (!VALID_STORAGE_MODES.has(mode)) {
        throw new Error(`Unsupported STORAGE_MODE: ${mode}. Expected legacy, dual-write, or postgres.`);
    }
    if (explicitMode && legacyMode && explicitMode !== legacyMode) {
        throw new Error(`STORAGE_MODE=${explicitMode} conflicts with STORAGE_DRIVER=${env.STORAGE_DRIVER}.`);
    }
    return mode;
}

module.exports = { VALID_STORAGE_MODES, resolveStorageMode };
