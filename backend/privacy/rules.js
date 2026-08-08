const RULESET_VERSION = '2026-08-08.1';
const NOTICE_VERSION = '2026-08-08';

// EU Article 8 ages must be reviewed before enabling a new Member State.
// Values below are a conservative operational matrix; product guardian approval remains 18 everywhere.
const EU_SELF_CONSENT_AGE = Object.freeze({
    AT: 14, BE: 13, BG: 14, CY: 14, CZ: 15, DE: 16, DK: 13, EE: 13,
    ES: 14, FI: 13, FR: 15, GR: 15, HR: 16, HU: 16, IE: 16, IT: 14,
    LT: 14, LU: 16, LV: 13, MT: 13, NL: 16, PL: 16, PT: 13, RO: 16,
    SE: 13, SI: 16, SK: 16
});

function normalizeCountry(value) {
    const country = String(value || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw Object.assign(new Error('A valid two-letter country code is required'), { statusCode: 400 });
    return country;
}

function parseBirthDate(value, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw Object.assign(new Error('Date of birth must use YYYY-MM-DD'), { statusCode: 400 });
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw Object.assign(new Error('Date of birth is invalid'), { statusCode: 400 });
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (date > today || year < now.getUTCFullYear() - 125) throw Object.assign(new Error('Date of birth is outside the supported range'), { statusCode: 400 });
    return date;
}

function ageOn(date, now = new Date()) {
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    const beforeBirthday = now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
    return age - (beforeBirthday ? 1 : 0);
}

function evaluateAge({ dateOfBirth, countryCode, regionCode, now = new Date() }) {
    const country = normalizeCountry(countryCode);
    const birthDate = parseBirthDate(dateOfBirth, now);
    const age = ageOn(birthDate, now);
    const ageBand = age < 13 ? 'under_13' : age < 16 ? '13_15' : age < 18 ? '16_17' : 'adult';
    let requiredPath = age >= 18 ? 'adult' : 'guardian';
    if (country === 'US' && age < 13) requiredPath = 'coppa_vpc';
    const selfConsentAge = country === 'GB' ? 13 : (EU_SELF_CONSENT_AGE[country] || (Object.hasOwn(EU_SELF_CONSENT_AGE, country) ? EU_SELF_CONSENT_AGE[country] : null));
    return Object.freeze({
        countryCode: country,
        regionCode: regionCode ? String(regionCode).trim().toUpperCase().slice(0, 12) : null,
        dateOfBirth: dateOfBirth,
        ageYears: age,
        ageBand,
        requiredPath,
        productGuardianAge: 18,
        legalSelfConsentAge: selfConsentAge,
        californiaSaleShareOptIn: country === 'US' && String(regionCode || '').toUpperCase() === 'CA' && age < 16,
        rulesetVersion: RULESET_VERSION,
        noticeVersion: NOTICE_VERSION
    });
}

function entitlementsFor({ privacyState, grants = {} }) {
    const active = privacyState === 'adult_active' || privacyState === 'minor_active';
    const minor = privacyState === 'minor_active';
    return Object.freeze({
        core_account: active,
        save_games: active,
        training_progress: active,
        google_sign_in: active,
        chesscom_link: active && (!minor || grants.chesscom_link === true),
        optional_analytics: active && grants.optional_analytics === true,
        cloud_ai: active && grants.cloud_ai === true,
        marketing: active && !minor && grants.marketing === true,
        public_profile: active && !minor && grants.public_profile === true,
        sale_or_cross_context_sharing: false
    });
}

module.exports = { RULESET_VERSION, NOTICE_VERSION, EU_SELF_CONSENT_AGE, normalizeCountry, parseBirthDate, ageOn, evaluateAge, entitlementsFor };

