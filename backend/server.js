const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createRepository } = require('./storage');
const { convertPgnToAiTextFormat, upgradeAiTextFormatWithFens, aiTextNeedsFenUpgrade } = require('./chessTextFormat');
const { analyzeTrainingProfile, getTrainingPuzzles, createEmptyProfile } = require('../server/training/trainingCoach');
const { logger, requestContext } = require('./observability/logger');
const { resolveStorageMode } = require('./config/storageMode');
const { OAuth2Client } = require('google-auth-library');
const { authConfig } = require('./config/auth');
const { AuthService, sha256 } = require('./auth/service');
const { PrivacyService } = require('./privacy/service');
const { PrivacyNotifier } = require('./privacy/notifier');
const { privacyConfig } = require('./privacy/config');

const app = express();
const repository = createRepository();
const PORT = Number(process.env.PORT || 3001);
const authentication = authConfig();
const privacyConfiguration = privacyConfig();
const privacyNotifier = new PrivacyNotifier({ config: privacyConfiguration, logger });
const privacyService = new PrivacyService({ pool: repository.pool, config: privacyConfiguration, notifier: privacyNotifier, logger });
const authService = new AuthService({ pool: repository.pool, googleVerifier: new OAuth2Client(authentication.googleClientId), config: authentication, logger, privacyService });

app.use(cors({ origin: authentication.frontendOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-ID'] }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(requestContext);
app.use((req,res,next)=>{
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('x-frame-options','DENY');
    res.setHeader('referrer-policy','strict-origin-when-cross-origin');
    res.setHeader('permissions-policy','camera=(), microphone=(), geolocation=()');
    if (authentication.nodeEnv === 'production') res.setHeader('strict-transport-security','max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/privacy/') || req.path.startsWith('/auth/')) res.setHeader('cache-control','no-store');
    next();
});

function cookies(req) {
    return Object.fromEntries(String(req.headers.cookie || '').split(';').map(value => value.trim()).filter(Boolean).map(value => {
        const index = value.indexOf('=');
        return [decodeURIComponent(value.slice(0, index)), decodeURIComponent(value.slice(index + 1))];
    }));
}
function cookie(name, value, { httpOnly = false, maxAge } = {}) {
    return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}${authentication.cookieSecure ? '; Secure' : ''}${maxAge !== undefined ? `; Max-Age=${maxAge}` : ''}`;
}
function context(req) { return { requestId: req.requestId, ip: req.ip }; }

app.post('/auth/google', async (req, res) => {
    try {
        await privacyService.rateLimit('google_sign_in', req.ip || req.requestId, 20, 60);
        if (typeof req.body?.credential !== 'string' || req.body.credential.length > 10000) return res.status(400).json({ error: 'Google credential is required' });
        // Reject missing/invalid consent before verifying or processing any Google profile claims.
        await privacyService.assessment(req.body.assessmentToken, { requireApproved: true });
        const result = await authService.signIn(req.body.credential, req.body.assessmentToken, context(req));
        res.setHeader('Set-Cookie', [
            cookie(authentication.cookieName, result.sessionToken, { httpOnly: true, maxAge: authentication.sessionTtlSeconds }),
            cookie(authentication.csrfCookieName, result.csrfToken, { maxAge: authentication.sessionTtlSeconds })
        ]);
        res.json({ user: result.user });
    } catch (error) {
        logger.warn('auth.google.failed', { requestId: req.requestId, error });
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Sign-in failed', code: error.code });
    }
});

app.post('/privacy/age-assessments', async (req, res) => {
    try { res.status(201).json(await privacyService.createAssessment(req.body || {}, context(req))); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Age assessment failed', code: error.code }); }
});

app.post('/privacy/guardian/requests', async (req, res) => {
    try { res.status(201).json(await privacyService.requestGuardianConsent(req.body || {}, context(req))); }
    catch (error) { logger.warn('privacy.guardian.request.failed', { requestId: req.requestId, error }); res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Consent request failed', code: error.code }); }
});

app.get('/privacy/guardian/requests/:token', async (req, res) => {
    try { res.json(await privacyService.consentRequest(req.params.token)); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Consent request failed', code: error.code }); }
});

app.post('/privacy/guardian/decisions', async (req, res) => {
    try { res.json(await privacyService.decideGuardianConsent(req.body || {}, context(req))); }
    catch (error) { logger.warn('privacy.guardian.decision.failed', { requestId: req.requestId, error }); res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Consent decision failed', code: error.code }); }
});

app.post('/privacy/vpc/webhook', async (req, res) => {
    try { res.json(await privacyService.recordVPCVerification(req.body || {}, req.get('x-vpc-webhook-secret'), context(req))); }
    catch (error) { logger.warn('privacy.vpc.webhook.failed', { requestId: req.requestId, error }); res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Verification callback failed', code: error.code }); }
});

app.get('/privacy/guardian/manage/:token', async (req,res)=>{
    try{res.setHeader('cache-control','no-store');res.json(await privacyService.guardianProfile(req.params.token));}
    catch(error){res.status(error.statusCode||500).json({error:error.statusCode?error.message:'Guardian management failed',code:error.code});}
});

app.delete('/privacy/guardian/manage/:token', async (req,res)=>{
    try{await privacyService.rateLimit('guardian_revoke',req.ip||req.requestId,10,60);res.json(await privacyService.revokeGuardian(req.params.token,context(req)));}
    catch(error){res.status(error.statusCode||500).json({error:error.statusCode?error.message:'Guardian revocation failed',code:error.code});}
});

app.post('/privacy/guardian/manage/:token/export', async(req,res)=>{
    try{await privacyService.rateLimit('guardian_export',req.ip||req.requestId,5,60);const guardian=await privacyService.guardianProfile(req.params.token);if(!guardian.child_user_id)return res.status(409).json({error:'The child account has not been created'});res.setHeader('content-disposition',`attachment; filename="chessforge-child-export-${new Date().toISOString().slice(0,10)}.json"`);res.json(await privacyService.exportUser(guardian.child_user_id));}
    catch(error){res.status(error.statusCode||500).json({error:error.statusCode?error.message:'Guardian export failed',code:error.code});}
});

app.delete('/privacy/guardian/manage/:token/child', async(req,res)=>{
    try{await privacyService.rateLimit('guardian_delete',req.ip||req.requestId,5,60);const guardian=await privacyService.guardianProfile(req.params.token);if(!guardian.child_user_id)return res.status(409).json({error:'The child account has not been created'});res.json(await privacyService.deleteUser(guardian.child_user_id,{...context(req),actorType:'guardian'}));}
    catch(error){res.status(error.statusCode||500).json({error:error.statusCode?error.message:'Guardian deletion failed',code:error.code});}
});

app.use(async (req, res, next) => {
    try {
        req.auth = await authService.getSession(cookies(req)[authentication.cookieName]);
        if (req.auth) req.user = req.auth.user;
        next();
    } catch (error) { next(error); }
});

app.get('/auth/me', (req, res) => req.user ? res.json({ user: req.user }) : res.status(401).json({ error: 'Not authenticated' }));

function requireCsrf(req, res, next) {
    const supplied = req.get('x-csrf-token') || '';
    if (!req.auth || !supplied || sha256(supplied) !== req.auth.csrfHash) return res.status(403).json({ error: 'Invalid CSRF token' });
    next();
}
app.post('/auth/logout', requireCsrf, async (req, res) => {
    await authService.logout(cookies(req)[authentication.cookieName], context(req));
    res.setHeader('Set-Cookie', [cookie(authentication.cookieName, '', { httpOnly: true, maxAge: 0 }), cookie(authentication.csrfCookieName, '', { maxAge: 0 })]);
    res.json({ ok: true });
});

app.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authenticated user is required' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return requireCsrf(req, res, next);
    next();
});

app.get('/privacy/me', async (req, res) => {
    try { res.json(await privacyService.privacyProfile(req.user.id)); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Privacy profile failed', code: error.code }); }
});

app.put('/privacy/me/preferences', async (req, res) => {
    try { res.json(await privacyService.setPreferences(req.user.id, req.body || {}, context(req))); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Privacy preferences failed', code: error.code }); }
});

app.post('/privacy/me/export', async (req, res) => {
    try {
        const data = await privacyService.exportUser(req.user.id);
        res.setHeader('content-disposition', `attachment; filename="chessforge-export-${new Date().toISOString().slice(0,10)}.json"`);
        res.setHeader('cache-control', 'no-store'); res.json(data);
    } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Export failed', code: error.code }); }
});

app.post('/privacy/me/requests', async (req,res)=>{
    try{res.status(201).json(await privacyService.createRightsRequest(req.user.id,req.body?.requestType,context(req)));}
    catch(error){res.status(error.statusCode||500).json({error:error.statusCode?error.message:'Privacy request failed',code:error.code});}
});

app.delete('/privacy/me', async (req, res) => {
    try {
        const result = await privacyService.deleteUser(req.user.id, context(req));
        res.setHeader('Set-Cookie', [cookie(authentication.cookieName, '', { httpOnly: true, maxAge: 0 }), cookie(authentication.csrfCookieName, '', { maxAge: 0 })]);
        res.json(result);
    } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Deletion failed', code: error.code }); }
});

function requireFeature(feature) {
    return async (req, res, next) => {
        try { await privacyService.requireEntitlement(req.user.id, feature); next(); }
        catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Feature authorization failed', code: error.code }); }
    };
}

app.use('/api', requireFeature('core_account'));

function extractMetadata(pgn) {
    const metadata = {};
    const regex = /\[(\w+)\s+"(.*?)"\]/g;
    let match;
    while ((match = regex.exec(pgn)) !== null) metadata[match[1]] = match[2];
    return metadata;
}

app.post('/api/games', async (req, res) => {
    try {
        if (!req.body.pgn) return res.status(400).json({ error: 'PGN is required' });
        if (req.body.source === 'chess.com' || req.body.chessCom) await privacyService.requireEntitlement(req.user.id, 'chesscom_link');
        const headers = { ...extractMetadata(req.body.pgn), ...(req.body.headers || {}) };
        const game = await repository.saveGame(req.user.id, {
            ...req.body,
            headers,
            title: req.body.title || headers.Event || 'Untitled Game',
            result: req.body.result || headers.Result || '*',
            aiTextFormat: req.body.aiTextFormat || convertPgnToAiTextFormat(req.body.pgn)
        });
        res.status(201).json(game);
    } catch (error) {
        logger.error('game.save.failed', { requestId: req.requestId, userId: req.user.id, error });
        res.status(error.statusCode||500).json({ error: error.statusCode?error.message:'Failed to save game', code:error.code });
    }
});

app.get('/api/games', async (req, res) => {
    try { res.json(await repository.listGames(req.user.id)); }
    catch (error) { logger.error('game.list.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to list games' }); }
});

app.put('/api/games/library', async (req, res) => {
    try {
        if (Array.isArray(req.body.games) && req.body.games.some(game => game?.source === 'chess.com' || game?.chessCom)) await privacyService.requireEntitlement(req.user.id, 'chesscom_link');
        const games = await repository.replaceLibrary(req.user.id, Array.isArray(req.body.games) ? req.body.games : []);
        res.json({ games, count: games.length });
    } catch (error) { logger.error('game.library.replace.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(error.statusCode||500).json({ error: error.statusCode?error.message:'Failed to replace game library', code:error.code }); }
});

app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await repository.readGame(req.user.id, req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });
        res.json(game);
    } catch (error) { logger.error('game.read.failed', { requestId: req.requestId, userId: req.user.id, gameId: req.params.id, error }); res.status(500).json({ error: 'Failed to get game' }); }
});

app.delete('/api/games/:id', async (req, res) => {
    try {
        if (!(await repository.deleteGame(req.user.id, req.params.id))) return res.status(404).json({ error: 'Game not found' });
        res.json({ message: 'Game deleted successfully' });
    } catch (error) { logger.error('game.delete.failed', { requestId: req.requestId, userId: req.user.id, gameId: req.params.id, error }); res.status(500).json({ error: 'Failed to delete game' }); }
});

app.post('/api/backfill', async (req, res) => {
    const stats = { scanned: 0, converted: 0, skipped: 0, failed: 0 };
    try {
        for (const game of await repository.listGames(req.user.id)) {
            stats.scanned++;
            if (!game.pgn) { stats.skipped++; continue; }
            try {
                const current = game.aiTextFormat || '';
                const next = !current.trim() ? convertPgnToAiTextFormat(game.pgn)
                    : (aiTextNeedsFenUpgrade(current) ? upgradeAiTextFormatWithFens(current) : null);
                if (!next) { stats.skipped++; continue; }
                await repository.saveGame(req.user.id, { ...game, aiTextFormat: next });
                stats.converted++;
            } catch (error) { logger.error('game.backfill.item.failed', { requestId: req.requestId, userId: req.user.id, gameId: game.id, error }); stats.failed++; }
        }
        res.json(stats);
    } catch (error) { logger.error('game.backfill.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Backfill failed' }); }
});

async function readProfile(userId) { return await repository.getTrainingProfile(userId) || createEmptyProfile(); }
app.get(['/api/training/profile', '/api/training/skill-profile'], async (req, res) => res.json(await readProfile(req.user.id)));

app.post('/api/training/skill-profile', async (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ error: 'Profile body is required' });
        const profile = await repository.saveTrainingProfile(req.user.id, req.body);
        res.json({ message: 'Skill profile saved successfully', profile });
    } catch (error) { logger.error('training.profile.save.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to save skill profile' }); }
});

app.delete('/api/training/skill-profile', async (req, res) => {
    try {
        await repository.clearTrainingProfile(req.user.id);
        res.json({ message: 'Skill profile cleared', profile: createEmptyProfile() });
    } catch (error) { logger.error('training.profile.clear.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to clear skill profile' }); }
});

app.post('/api/training/analyze', async (req, res) => {
    try {
        const profile = await analyzeTrainingProfile(Array.isArray(req.body.games) ? req.body.games : [], {
            mistakeThreshold: 1.5,
            excludeIds: Array.isArray(req.body.excludeIds) ? req.body.excludeIds : []
        });
        res.json(await repository.saveTrainingProfile(req.user.id, profile));
    } catch (error) { logger.error('training.analysis.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to analyze training profile' }); }
});

app.get('/api/training/puzzles', async (req, res) => {
    try {
        res.json(getTrainingPuzzles(req.query.theme, {
            targetRating: req.query.rating,
            level: req.query.level,
            boss: req.query.boss === '1' || req.query.boss === 'true',
            excludeIds: String(req.query.exclude || '').split(',').map(id => id.trim()).filter(Boolean),
            profile: await readProfile(req.user.id)
        }));
    } catch (error) { logger.error('training.puzzles.failed', { requestId: req.requestId, userId: req.user.id, error }); res.status(500).json({ error: 'Failed to retrieve training puzzles' }); }
});

app.get('/api/health', async (req, res) => res.json(await repository.healthCheck()));

async function start() {
    await repository.initialize();
    return app.listen(PORT, () => logger.info('service.started', {
        port: PORT,
        storageMode: resolveStorageMode(),
        environment: process.env.NODE_ENV || 'development'
    }));
}

if (require.main === module) start().catch(error => {
    logger.error('storage.initialization.failed', { storageMode: process.env.STORAGE_MODE, error });
    process.exitCode = 1;
});

module.exports = { app, start };
