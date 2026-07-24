const { Pool } = require('pg');
const { canonicalGame, apiGame } = require('./gameModel');
const { LIBRARY_LIMIT } = require('./localRepository');

function rowToGame(row) {
    return {
        id: row.id, title: row.title, source: row.source,
        externalGameId: row.external_game_id, externalUrl: row.external_url,
        eventName: row.event_name, site: row.site, whitePlayer: row.white_player,
        blackPlayer: row.black_player, userColor: row.user_color, result: row.result,
        playedAt: row.played_at && row.played_at.toISOString(), timeClass: row.time_class,
        rules: row.rules, moveCount: row.move_count, pgn: row.pgn, aiText: row.ai_text,
        importState: row.import_state, metadata: row.metadata,
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
    };
}

const COLUMNS = `id, title, source, external_game_id, external_url, event_name, site,
 white_player, black_player, user_color, result, played_at, time_class, rules,
 move_count, pgn, ai_text, import_state, metadata, created_at, updated_at`;

class PostgresRepository {
    constructor(options = {}) {
        this.pool = options.pool || new Pool({
            connectionString: options.connectionString || process.env.DATABASE_URL,
            max: Number(process.env.DB_POOL_SIZE || 10),
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000
        });
    }

    async initialize() { await this.healthCheck(); }

    async ensureUser(client, userId) {
        await client.query(`INSERT INTO users (id, auth_subject, email, display_name)
            VALUES ($1, $1, $1 || '@local.invalid', 'Local ChessForge User')
            ON CONFLICT (id) DO NOTHING`, [userId]);
    }

    async saveGame(userId, input, client = this.pool) {
        let game = canonicalGame(input);
        await this.ensureUser(client, userId);
        if (game.externalGameId) {
            const existing = await client.query(
                'SELECT id FROM games WHERE user_id=$1 AND source=$2 AND external_game_id=$3',
                [userId, game.source, game.externalGameId]
            );
            if (existing.rows[0]) game = { ...game, id: existing.rows[0].id };
        }
        const values = [game.id, userId, game.title, game.source, game.externalGameId, game.externalUrl,
            game.eventName, game.site, game.whitePlayer, game.blackPlayer, game.userColor, game.result,
            game.playedAt, game.timeClass, game.rules, game.moveCount, game.pgn, game.aiText,
            game.importState, game.metadata, game.createdAt];
        const result = await client.query(`INSERT INTO games
            (id, user_id, title, source, external_game_id, external_url, event_name, site,
             white_player, black_player, user_color, result, played_at, time_class, rules,
             move_count, pgn, ai_text, import_state, metadata, created_at)
            VALUES (${values.map((_, i) => `$${i + 1}`).join(',')})
            ON CONFLICT (id) DO UPDATE SET
              title=EXCLUDED.title, source=EXCLUDED.source,
              external_game_id=EXCLUDED.external_game_id, external_url=EXCLUDED.external_url,
              event_name=EXCLUDED.event_name, site=EXCLUDED.site,
              white_player=EXCLUDED.white_player, black_player=EXCLUDED.black_player,
              user_color=EXCLUDED.user_color, result=EXCLUDED.result, played_at=EXCLUDED.played_at,
              time_class=EXCLUDED.time_class, rules=EXCLUDED.rules, move_count=EXCLUDED.move_count,
              pgn=COALESCE(EXCLUDED.pgn, games.pgn), ai_text=COALESCE(EXCLUDED.ai_text, games.ai_text),
              import_state=CASE WHEN COALESCE(EXCLUDED.pgn, games.pgn) IS NULL THEN 'metadata_only' ELSE 'complete' END,
              metadata=EXCLUDED.metadata, updated_at=now()
            WHERE games.user_id=EXCLUDED.user_id
            RETURNING ${COLUMNS}`, values);
        if (!result.rows[0]) throw new Error('Game ID belongs to another user.');
        return apiGame(rowToGame(result.rows[0]));
    }

    async readGame(userId, gameId) {
        const result = await this.pool.query(`SELECT ${COLUMNS} FROM games WHERE user_id=$1 AND id=$2`, [userId, gameId]);
        return result.rows[0] ? apiGame(rowToGame(result.rows[0])) : null;
    }

    async listGames(userId) {
        const result = await this.pool.query(`SELECT ${COLUMNS} FROM games WHERE user_id=$1
            ORDER BY played_at DESC NULLS LAST, created_at DESC LIMIT $2`, [userId, LIBRARY_LIMIT]);
        return result.rows.map(rowToGame).map(apiGame);
    }

    async deleteGame(userId, gameId) {
        const result = await this.pool.query('DELETE FROM games WHERE user_id=$1 AND id=$2', [userId, gameId]);
        return result.rowCount === 1;
    }

    async replaceLibrary(userId, inputs) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const saved = [];
            for (const input of (Array.isArray(inputs) ? inputs : []).slice(0, LIBRARY_LIMIT)) saved.push(await this.saveGame(userId, input, client));
            const ids = saved.map(game => game.id);
            await client.query('DELETE FROM games WHERE user_id=$1 AND NOT (id = ANY($2::uuid[]))', [userId, ids]);
            await client.query('COMMIT');
            return saved;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    }

    async getTrainingProfile(userId) {
        const result = await this.pool.query('SELECT profile FROM training_profiles WHERE user_id=$1', [userId]);
        return result.rows[0] ? result.rows[0].profile : null;
    }

    async saveTrainingProfile(userId, profile) {
        await this.ensureUser(this.pool, userId);
        const record = { ...profile, userId, updatedAt: new Date().toISOString() };
        await this.pool.query(`INSERT INTO training_profiles (user_id, profile, updated_at) VALUES ($1,$2,now())
            ON CONFLICT (user_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=now()`, [userId, record]);
        return record;
    }

    async clearTrainingProfile(userId) { await this.pool.query('DELETE FROM training_profiles WHERE user_id=$1', [userId]); return true; }
    async healthCheck() { const result = await this.pool.query('SELECT 1 AS ok'); return { storage: 'postgres', ok: result.rows[0].ok === 1 }; }
    async close() { await this.pool.end(); }
}

module.exports = { PostgresRepository };
