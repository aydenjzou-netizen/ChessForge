const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAge, ageOn, parseBirthDate, entitlementsFor, RULESET_VERSION } = require('../privacy/rules');

const now = new Date('2026-08-08T12:00:00Z');

test('age calculation handles birthdays and leap-day dates using UTC dates', () => {
    assert.equal(ageOn(parseBirthDate('2008-08-08', now), now), 18);
    assert.equal(ageOn(parseBirthDate('2008-08-09', now), now), 17);
    assert.equal(ageOn(parseBirthDate('2012-02-29', now), now), 14);
});

test('US children under 13 are routed to COPPA VPC', () => {
    const result = evaluateAge({ dateOfBirth: '2014-08-09', countryCode: 'US', regionCode: 'CA', now });
    assert.equal(result.requiredPath, 'coppa_vpc');
    assert.equal(result.ageBand, 'under_13');
    assert.equal(result.californiaSaleShareOptIn, true);
});

test('all users under 18 require guardian approval as a product rule', () => {
    for (const countryCode of ['GB', 'FR', 'DE', 'MY', 'XX']) {
        assert.equal(evaluateAge({ dateOfBirth: '2010-01-01', countryCode, now }).requiredPath, 'guardian');
    }
    assert.equal(evaluateAge({ dateOfBirth: '2000-01-01', countryCode: 'MY', now }).requiredPath, 'adult');
});

test('EU and UK self-consent metadata remains distinct from product guardian age', () => {
    assert.equal(evaluateAge({ dateOfBirth: '2010-01-01', countryCode: 'GB', now }).legalSelfConsentAge, 13);
    assert.equal(evaluateAge({ dateOfBirth: '2010-01-01', countryCode: 'FR', now }).legalSelfConsentAge, 15);
    assert.equal(evaluateAge({ dateOfBirth: '2010-01-01', countryCode: 'DE', now }).legalSelfConsentAge, 16);
    assert.equal(evaluateAge({ dateOfBirth: '2010-01-01', countryCode: 'MY', now }).legalSelfConsentAge, null);
    assert.match(RULESET_VERSION, /^2026-/);
});

test('minor entitlements fail closed and never permit sale or cross-context sharing', () => {
    const entitlements = entitlementsFor({ privacyState: 'minor_active', grants: { chesscom_link: true, optional_analytics: false, marketing: true, public_profile: true } });
    assert.equal(entitlements.core_account, true);
    assert.equal(entitlements.chesscom_link, true);
    assert.equal(entitlements.marketing, false);
    assert.equal(entitlements.public_profile, false);
    assert.equal(entitlements.sale_or_cross_context_sharing, false);
    assert.equal(entitlements.cloud_ai, false);
});

test('invalid, future and implausibly old birth dates are rejected', () => {
    assert.throws(() => parseBirthDate('2026-02-30', now), /invalid/);
    assert.throws(() => parseBirthDate('2027-01-01', now), /outside/);
    assert.throws(() => parseBirthDate('1800-01-01', now), /outside/);
});

