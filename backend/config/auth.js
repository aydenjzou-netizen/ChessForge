function required(env, name) {
    const value = String(env[name] || '').trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
}

function positiveInteger(value, fallback, name) {
    const parsed = Number(value || fallback);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
    return parsed;
}

function authConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV || 'development';
    const frontendOrigin = required(env, 'FRONTEND_ORIGIN');
    const parsedOrigin = new URL(frontendOrigin);
    if (parsedOrigin.origin !== frontendOrigin || !['http:', 'https:'].includes(parsedOrigin.protocol)) {
        throw new Error('FRONTEND_ORIGIN must be an exact origin without a path.');
    }
    return Object.freeze({
        nodeEnv,
        googleClientId: required(env, 'GOOGLE_CLIENT_ID'),
        frontendOrigin,
        sessionTtlSeconds: positiveInteger(env.SESSION_TTL_SECONDS, 604800, 'SESSION_TTL_SECONDS'),
        cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
        cookieName: 'chessforge_session',
        csrfCookieName: 'chessforge_csrf'
    });
}

module.exports = { authConfig };
