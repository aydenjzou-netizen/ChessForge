const fs = require('fs-extra');
const path = require('path');
const { Pool } = require('pg');

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            filename text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )`);
        const directory = path.join(__dirname, '..', 'migrations');
        for (const filename of (await fs.readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
            const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
            if (exists.rowCount) { console.log(`skip ${filename}`); continue; }
            const sql = await fs.readFile(path.join(directory, filename), 'utf8');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
                await client.query('COMMIT');
                console.log(`applied ${filename}`);
            } catch (error) { await client.query('ROLLBACK'); throw error; }
            finally { client.release(); }
        }
    } finally { await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
