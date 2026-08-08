const { createPool } = require('../config/database');

const EXPECTED_TABLES = [
    'external_accounts', 'game_analyses', 'games', 'move_analyses',
    'puzzle_attempts', 'puzzle_sessions', 'training_profiles',
    'user_activity', 'user_weaknesses', 'users', 'auth_identities', 'auth_sessions',
    'auth_audit_events', 'privacy_age_assessments', 'guardian_consent_requests',
    'guardian_relationships', 'privacy_consent_grants', 'privacy_consent_events',
    'privacy_requests', 'privacy_deletion_tombstones', 'privacy_rate_limits'
];

async function main() {
    const pool = createPool({ max: 1 });
    try {
        const tables = await pool.query(`SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
        const names = new Set(tables.rows.map(row => row.table_name));
        const missing = EXPECTED_TABLES.filter(name => !names.has(name));
        if (missing.length) throw new Error(`Missing tables: ${missing.join(', ')}`);

        const invalid = await pool.query(`SELECT conrelid::regclass::text AS table_name, conname
            FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated`);
        if (invalid.rowCount) throw new Error(`Unvalidated constraints: ${JSON.stringify(invalid.rows)}`);

        const counts = await pool.query(`SELECT
            (SELECT count(*)::integer FROM users) AS users,
            (SELECT count(*)::integer FROM games) AS games,
            (SELECT count(*)::integer FROM training_profiles) AS training_profiles`);
        console.log(JSON.stringify({ ok: true, tables: EXPECTED_TABLES.length, rows: counts.rows[0] }, null, 2));
    } finally { await pool.end(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
