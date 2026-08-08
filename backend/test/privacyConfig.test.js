const test = require('node:test');
const assert = require('node:assert/strict');
const { privacyConfig } = require('../privacy/config');

test('development guardian attestation cannot be enabled in production', () => {
    const config = privacyConfig({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://chessforge.example', PRIVACY_ALLOW_DEV_GUARDIAN_APPROVAL: 'true',
        PRIVACY_OPERATOR_NAME:'ChessForge Ltd',PRIVACY_CONTACT_EMAIL:'privacy@chessforge.example',PRIVACY_NOTICE_URL:'https://chessforge.example/privacy.html',
        PRIVACY_EMAIL_WEBHOOK_URL:'https://mail.example/send',PRIVACY_EMAIL_WEBHOOK_TOKEN:'secret',PRIVACY_VPC_START_URL:'https://verify.example/start',PRIVACY_VPC_WEBHOOK_SECRET:'secret2' });
    assert.equal(config.allowDevGuardianApproval, false);
});

test('production fails closed when guardian verification or direct notice is not configured',()=>{
    assert.throws(()=>privacyConfig({NODE_ENV:'production',FRONTEND_ORIGIN:'https://chessforge.example'}),/PRIVACY_OPERATOR_NAME is required/);
});

test('privacy endpoints use the exact configured frontend origin', () => {
    const config = privacyConfig({ NODE_ENV: 'test', FRONTEND_ORIGIN: 'http://localhost:5173', PRIVACY_CONSENT_TTL_HOURS: '48' });
    assert.equal(config.frontendOrigin, 'http://localhost:5173');
    assert.equal(config.privacyNoticeUrl, 'http://localhost:5173/privacy.html');
    assert.equal(config.consentTtlHours, 48);
});
