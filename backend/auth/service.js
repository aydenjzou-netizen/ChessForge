const crypto = require('crypto');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

class AuthService {
    constructor({ pool, googleVerifier, config, logger, privacyService }) {
        this.pool = pool;
        this.googleVerifier = googleVerifier;
        this.config = config;
        this.logger = logger;
        this.privacyService = privacyService;
    }

    async audit(client, eventType, outcome, context = {}, userId = null, details = {}) {
        await client.query(`INSERT INTO auth_audit_events
            (user_id,event_type,outcome,request_id,ip_hash,details) VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, eventType, outcome, context.requestId, context.ip ? sha256(context.ip) : null, details]);
        this.logger.info('auth.audit', { eventType, outcome, userId, requestId: context.requestId });
    }

    async signIn(credential, assessmentToken, context = {}) {
        let payload;
        try {
            const ticket = await this.googleVerifier.verifyIdToken({ idToken: credential, audience: this.config.googleClientId });
            payload = ticket.getPayload();
            if (!payload?.sub || !payload.email || payload.email_verified !== true) throw new Error('Required Google claims are missing.');
        } catch (error) {
            await this.audit(this.pool, 'google_sign_in', 'failure', context, null, { reason: 'invalid_credential' });
            throw Object.assign(new Error('Invalid Google credential'), { statusCode: 401 });
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`google:${payload.sub}`]);
            let identity = await client.query(`SELECT u.id FROM auth_identities i JOIN users u ON u.id=i.user_id
                WHERE i.provider='google' AND i.provider_subject=$1`, [payload.sub]);
            let userId = identity.rows[0]?.id;
            if (!userId) {
                const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1) FOR UPDATE', [payload.email]);
                userId = existing.rows[0]?.id;
                if (!userId) {
                    const user = await client.query(`INSERT INTO users (auth_subject,email,display_name,picture_url,last_login_at)
                        VALUES ($1,$2,$3,$4,now()) RETURNING id`, [`google:${payload.sub}`, payload.email, payload.name || payload.email, payload.picture || null]);
                    userId = user.rows[0].id;
                }
                await client.query(`INSERT INTO auth_identities (user_id,provider,provider_subject,email,email_verified)
                    VALUES ($1,'google',$2,$3,true) ON CONFLICT (provider,provider_subject) DO NOTHING`, [userId, payload.sub, payload.email]);
            }
            await client.query(`UPDATE users SET email=$2,display_name=$3,picture_url=$4,last_login_at=now(),updated_at=now() WHERE id=$1`,
                [userId, payload.email, payload.name || payload.email, payload.picture || null]);
            const privacyState = await this.privacyService.activateUserFromAssessment(client, userId, assessmentToken);
            const sessionToken = randomToken();
            const csrfToken = randomToken();
            await client.query(`INSERT INTO auth_sessions (user_id,token_hash,csrf_hash,expires_at)
                VALUES ($1,$2,$3,now()+($4 * interval '1 second'))`, [userId, sha256(sessionToken), sha256(csrfToken), this.config.sessionTtlSeconds]);
            await this.audit(client, 'google_sign_in', 'success', context, userId);
            await client.query('COMMIT');
            return { user: { id: userId, email: payload.email, name: payload.name || payload.email, picture: payload.picture || null, privacyState }, sessionToken, csrfToken };
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }

    async getSession(token) {
        if (!token) return null;
        const result = await this.pool.query(`SELECT s.id AS session_id,u.id,u.email,u.display_name,u.picture_url,u.privacy_state,u.age_band,u.country_code,s.csrf_hash
            FROM auth_sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active'
              AND u.privacy_state IN ('adult_active','minor_active')`, [sha256(token)]);
        const row = result.rows[0];
        return row ? { sessionId: row.session_id, csrfHash: row.csrf_hash, user: { id: row.id, email: row.email, name: row.display_name, picture: row.picture_url, privacyState: row.privacy_state, ageBand: row.age_band, countryCode: row.country_code } } : null;
    }

    async logout(token, context = {}) {
        if (!token) return;
        const result = await this.pool.query(`UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING user_id`, [sha256(token)]);
        await this.audit(this.pool, 'logout', 'success', context, result.rows[0]?.user_id || null);
    }
}

module.exports = { AuthService, sha256 };
