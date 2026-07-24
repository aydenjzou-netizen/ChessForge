const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { LocalRepository } = require('../storage/localRepository');
const { canonicalGame } = require('../storage/gameModel');

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';

test('canonical model removes duplicate legacy fields', () => {
    const game = canonicalGame({ id: USER_A, name: 'A vs B', Date: '2026.05.20', result: '1-0',
        headers: { White: 'A', Black: 'B', Result: '1-0' }, chessCom: { uuid: 'external-1' } });
    assert.equal(game.title, 'A vs B');
    assert.equal(game.whitePlayer, 'A');
    assert.equal(game.externalGameId, 'external-1');
    assert.equal(game.importState, 'metadata_only');
    assert.equal(game.rawPGN, undefined);
    assert.equal(game.gameMetadata, undefined);
});

test('local repository isolates users and preserves full PGN', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chessforge-storage-'));
    t.after(() => fs.remove(root));
    const repository = new LocalRepository(root);
    await repository.initialize();
    const saved = await repository.saveGame(USER_A, { id: USER_A, title: 'Game', pgn: '[Event "Game"]\n\n1. e4 *',
        headers: { White: 'A', Black: 'B', Result: '*' } });
    assert.equal(saved.pgn.includes('1. e4'), true);
    assert.equal((await repository.listGames(USER_A)).length, 1);
    assert.equal((await repository.listGames(USER_B)).length, 0);
    assert.equal(await repository.readGame(USER_B, USER_A), null);
});

test('training profiles are isolated per user', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chessforge-profile-'));
    t.after(() => fs.remove(root));
    const repository = new LocalRepository(root);
    await repository.saveTrainingProfile(USER_A, { totalXp: 50 });
    await repository.saveTrainingProfile(USER_B, { totalXp: 10 });
    assert.equal((await repository.getTrainingProfile(USER_A)).totalXp, 50);
    assert.equal((await repository.getTrainingProfile(USER_B)).totalXp, 10);
});

test('metadata-only refresh does not erase an existing PGN', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chessforge-refresh-'));
    t.after(() => fs.remove(root));
    const repository = new LocalRepository(root);
    await repository.saveGame(USER_A, { id: USER_A, pgn: '[Event "Game"]\n\n1. e4 *', headers: { White: 'A', Black: 'B' } });
    await repository.replaceLibrary(USER_A, [{ id: USER_A, isMetadataOnly: true, headers: { White: 'A', Black: 'B' } }]);
    assert.match((await repository.readGame(USER_A, USER_A)).pgn, /1\. e4/);
});
