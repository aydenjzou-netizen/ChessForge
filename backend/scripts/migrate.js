const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { createPool } = require('../config/database');

function checksum(sql) {
    return crypto.createHash('sha256').update(sql).digest('hex');
}

async function main() {
    const pool = createPool({ max: 1 });
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            filename text PRIMARY KEY,
            checksum text,
            applied_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
        await pool.query("SELECT pg_advisory_lock(hashtext('chessforge-schema-migrations'))");
        const directory = path.join(__dirname, '..', 'migrations');
        for (const filename of (await fs.readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
            const sql = await fs.readFile(path.join(directory, filename), 'utf8');
            const digest = checksum(sql);
            const exists = await pool.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [filename]);
            if (exists.rowCount) {
                if (exists.rows[0].checksum && exists.rows[0].checksum !== digest) {
                    throw new Error(`Applied migration ${filename} was modified.`);
                }
                if (!exists.rows[0].checksum) {
                    await pool.query('UPDATE schema_migrations SET checksum=$2 WHERE filename=$1', [filename, digest]);
                }
                console.log(`skip ${filename}`);
                continue;
            }
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1,$2)', [filename, digest]);
                await client.query('COMMIT');
                console.log(`applied ${filename}`);
            } catch (error) { await client.query('ROLLBACK'); throw error; }
            finally { client.release(); }
        }
    } finally {
        await pool.query("SELECT pg_advisory_unlock(hashtext('chessforge-schema-migrations'))").catch(() => {});
        await pool.end();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
