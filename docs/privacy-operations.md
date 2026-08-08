# ChessForge privacy operations

This runbook is part of the privacy control, not a claim of universal legal compliance. Privacy counsel must approve launch countries, notices, vendors, verification methods, retention, and incident timelines before production.

## Production launch gates

1. Replace every bracketed field in `static/privacy.html` and publish the legal entity, address, privacy contact, representatives, and named subprocessor list.
2. Review `backend/privacy/rules.js` against current official law for every enabled country. Record counsel approval and increment both the ruleset and notice versions for material changes.
3. Configure `PRIVACY_EMAIL_WEBHOOK_URL`, `PRIVACY_VPC_START_URL`, and `PRIVACY_VPC_WEBHOOK_SECRET`. Production rejects development guardian attestation even if its environment flag is set.
4. Configure processor deletion callbacks in `PRIVACY_DELETION_WEBHOOK_URLS`; test success, failure, retry and evidence retention for each processor.
5. Run database migrations, the test suite, a penetration test, accessibility review, child/guardian comprehension testing, and a DPIA/child-impact assessment.
6. Confirm that optional analytics, advertising, cloud AI, error-monitoring SDKs, and external requests are absent before the relevant entitlement. ChessForge currently hard-disables sale/cross-context sharing.
7. Configure a daily run of `npm run privacy:maintain --prefix backend`, monitoring non-zero exits.

## Consent evidence and support

- Do not ask guardians to email identity documents. Raw evidence should remain with the approved verification provider; ChessForge stores a hashed provider reference and assurance result.
- Consent and management links are secrets. Never paste them into tickets, analytics, logs, screenshots, or chat.
- For custody disputes or conflicting guardians, suspend optional processing and escalate to privacy counsel. Support must not decide legal authority from informal documents.
- A denied or expired request does not create an account. A revoked request restricts an existing account and revokes all sessions.
- Rights requests appear in `privacy_requests`. Verify identity/authority proportionately, document the response, and update status before the recorded due date.

## Deletion and export

- The deletion endpoint immediately removes the primary account and cascading game/training data, pseudonymizes retained guardian evidence, creates a restoration tombstone, and calls configured processors.
- A failed processor callback leaves the request in `processing`; operations must retry and record completion. Never report completion while a configured processor remains failed.
- Backups must expire on the approved schedule. Restoration procedures must consult `privacy_deletion_tombstones` before making restored accounts accessible.
- Exports contain account, identity, game, training, consent and guardian-relationship data in JSON. Deliver only through the authenticated, short-lived user session.

## Incident response

1. Contain access, preserve relevant evidence, rotate exposed credentials, and open a restricted incident record.
2. Identify affected data, users, minors, countries, processors, encryption status, and likely harm.
3. Notify security, privacy counsel, the DPO/privacy owner, leadership, insurer, and affected processors.
4. Counsel determines regulator and individual notifications. GDPR supervisory-authority notice may be due within 72 hours after awareness unless the breach is unlikely to risk rights and freedoms; apply the current UK, Malaysia, U.S. state and other rules independently.
5. Document the decision even when notice is not required. Complete root cause, corrective action, deletion/credential follow-up, and a child-specific harm review.

## Azure deployment

- Put secrets in Key Vault and use managed identity. Never place VPC, email, database, or deletion webhook secrets in source control.
- Keep query strings out of Front Door, Application Insights and reverse-proxy logs because guardian links contain secret tokens.
- Use private endpoints and least-privilege database roles; restrict access to consent, guardian and rights tables.
- Confirm primary, replica, backup, logging and support-access regions under the executed Microsoft DPA and transfer mechanism.
- Add alerts for guardian verification failures, consent bypass attempts, deletion fan-out failures, unusual age retries, expired maintenance jobs and privileged access.

## Change management

Any new analytics SDK, cloud model, public/social feature, advertising, identity provider, account integration, child-directed content, country, or processor requires a privacy review before merge. Update the data map, DPIA, ruleset, tests, notice, processor list and consent scopes as applicable.

