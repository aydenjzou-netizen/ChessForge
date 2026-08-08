const crypto = require('crypto');
const { evaluateAge, entitlementsFor, RULESET_VERSION, NOTICE_VERSION } = require('./rules');

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const httpError = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

class PrivacyService {
    constructor({ pool, config, notifier, logger }) { Object.assign(this, { pool, config, notifier, logger }); }

    async event(client, eventType, context = {}, refs = {}, metadata = {}, actorType = 'system') {
        await client.query(`INSERT INTO privacy_consent_events
          (user_id,assessment_id,consent_request_id,event_type,actor_type,request_id,ip_hash,ruleset_version,notice_version,metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [refs.userId || null, refs.assessmentId || null, refs.consentRequestId || null,
            eventType, actorType, context.requestId || null, context.ip ? sha256(context.ip) : null, RULESET_VERSION, NOTICE_VERSION, metadata]);
    }

    async rateLimit(scope, key, limit, minutes) {
        const hash = sha256(key);
        const result = await this.pool.query(`INSERT INTO privacy_rate_limits(scope,key_hash,window_started_at,attempts) VALUES($1,$2,now(),1)
          ON CONFLICT(scope,key_hash) DO UPDATE SET attempts=CASE WHEN privacy_rate_limits.window_started_at < now()-($3*interval '1 minute') THEN 1 ELSE privacy_rate_limits.attempts+1 END,
          window_started_at=CASE WHEN privacy_rate_limits.window_started_at < now()-($3*interval '1 minute') THEN now() ELSE privacy_rate_limits.window_started_at END
          RETURNING attempts`, [scope, hash, minutes]);
        if (result.rows[0].attempts > limit) throw httpError(429, 'Too many attempts. Try again later.', 'RATE_LIMITED');
    }

    async createAssessment(input, context = {}) {
        await this.cleanupExpired();
        await this.rateLimit('age_assessment', context.ip || context.requestId || 'unknown', 12, 60);
        const result = evaluateAge(input);
        const token = randomToken();
        const inserted = await this.pool.query(`INSERT INTO privacy_age_assessments
          (token_hash,date_of_birth,country_code,region_code,age_years,age_band,required_path,ruleset_version,notice_version,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+($10*interval '1 minute')) RETURNING id,expires_at`,
        [sha256(token), result.dateOfBirth, result.countryCode, result.regionCode, result.ageYears, result.ageBand, result.requiredPath,
            result.rulesetVersion, result.noticeVersion, this.config.assessmentTtlMinutes]);
        await this.event(this.pool, 'age_assessed', context, { assessmentId: inserted.rows[0].id }, { ageBand: result.ageBand, requiredPath: result.requiredPath, countryCode: result.countryCode });
        return { assessmentToken: token, expiresAt: inserted.rows[0].expires_at, ...result, dateOfBirth: undefined };
    }

    async cleanupExpired() {
        await this.pool.query(`DELETE FROM privacy_age_assessments WHERE expires_at<now() AND consumed_at IS NULL`);
        await this.pool.query(`UPDATE guardian_consent_requests SET status='expired' WHERE expires_at<now() AND status IN ('pending','verification_required')`);
        await this.pool.query(`DELETE FROM privacy_rate_limits WHERE window_started_at<now()-interval '2 days'`);
    }

    async assessment(token, { requireApproved = false, consume = false } = {}, client = this.pool) {
        if (!token) throw httpError(403, 'Age assessment is required', 'AGE_ASSESSMENT_REQUIRED');
        const lock = consume ? ' FOR UPDATE' : '';
        const result = await client.query(`SELECT * FROM privacy_age_assessments WHERE token_hash=$1 AND expires_at>now()${lock}`, [sha256(token)]);
        const row = result.rows[0];
        if (!row || row.consumed_at) throw httpError(403, 'Age assessment is invalid or expired', 'AGE_ASSESSMENT_EXPIRED');
        if (requireApproved && row.required_path !== 'adult' && !row.guardian_approved_at) throw httpError(403, 'Guardian approval is required', 'CONSENT_REQUIRED');
        return row;
    }

    async requestGuardianConsent({ assessmentToken, guardianEmail, relationship }, context = {}) {
        const assessment = await this.assessment(assessmentToken);
        if (assessment.required_path === 'adult') throw httpError(400, 'Guardian approval is not required', 'NOT_A_MINOR');
        const email = String(guardianEmail || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw httpError(400, 'A valid guardian email is required', 'INVALID_GUARDIAN_EMAIL');
        await this.rateLimit('guardian_email', email, 5, 1440);
        const decisionToken = randomToken();
        const inserted = await this.pool.query(`INSERT INTO guardian_consent_requests
          (assessment_id,guardian_email,guardian_email_hash,relationship_claim,decision_token_hash,status,expires_at)
          VALUES($1,$2,$3,$4,$5,'pending',now()+($6*interval '1 hour'))
          ON CONFLICT(assessment_id) DO UPDATE SET guardian_email=EXCLUDED.guardian_email,guardian_email_hash=EXCLUDED.guardian_email_hash,
          relationship_claim=EXCLUDED.relationship_claim,decision_token_hash=EXCLUDED.decision_token_hash,status='pending',expires_at=EXCLUDED.expires_at,resend_count=guardian_consent_requests.resend_count+1
          RETURNING id,expires_at`, [assessment.id, email, sha256(email), String(relationship || 'parent_or_guardian').slice(0,80), sha256(decisionToken), this.config.consentTtlHours]);
        await this.pool.query('UPDATE privacy_age_assessments SET expires_at=$2 WHERE id=$1',[assessment.id,inserted.rows[0].expires_at]);
        const decisionUrl = `${this.config.frontendOrigin}/?guardianConsent=${encodeURIComponent(decisionToken)}`;
        await this.notifier.guardianNotice({ guardianEmail: email, decisionUrl, childAgeBand: assessment.age_band, expiresAt: inserted.rows[0].expires_at });
        await this.event(this.pool, 'guardian_notice_sent', context, { assessmentId: assessment.id, consentRequestId: inserted.rows[0].id }, { ageBand: assessment.age_band });
        return { status: 'pending', expiresAt: inserted.rows[0].expires_at, developmentDecisionToken: this.config.allowDevGuardianApproval ? decisionToken : undefined };
    }

    async consentRequest(decisionToken) {
        const result = await this.pool.query(`SELECT r.id,r.status,r.expires_at,r.relationship_claim,a.age_band,a.country_code,a.required_path,a.notice_version
          FROM guardian_consent_requests r JOIN privacy_age_assessments a ON a.id=r.assessment_id
          WHERE r.decision_token_hash=$1`, [sha256(decisionToken)]);
        const row = result.rows[0];
        if (!row || row.expires_at <= new Date() || !['pending','verification_required'].includes(row.status)) throw httpError(404, 'Consent request is invalid or expired', 'CONSENT_REQUEST_EXPIRED');
        const verification = await this.pool.query('SELECT verification_method,verification_reference FROM guardian_consent_requests WHERE id=$1',[row.id]);
        return { id: row.id, status: row.status, expiresAt: row.expires_at, relationship: row.relationship_claim, ageBand: row.age_band, countryCode: row.country_code,
            requiredPath: row.required_path, noticeVersion: row.notice_version, requiresVPC: row.required_path === 'coppa_vpc', requiresGuardianVerification: true,
            verificationCompleted: verification.rows[0]?.verification_method === 'external_vpc' && !!verification.rows[0]?.verification_reference,
            verificationUrl: this.config.vpcStartUrl ? `${this.config.vpcStartUrl}${this.config.vpcStartUrl.includes('?')?'&':'?'}request_id=${encodeURIComponent(row.id)}` : null };
    }

    async recordVPCVerification({ requestId, verificationReference, relationship }, suppliedSecret, context={}) {
        const supplied = Buffer.from(sha256(suppliedSecret || ''));
        const expected = Buffer.from(sha256(this.config.vpcWebhookSecret || 'not-configured'));
        if (!this.config.vpcWebhookSecret || !crypto.timingSafeEqual(supplied, expected)) throw httpError(401,'Invalid verification provider credentials','INVALID_PROVIDER_CREDENTIALS');
        if (!/^[0-9a-f-]{36}$/i.test(String(requestId||'')) || !verificationReference) throw httpError(400,'Verification request data is invalid','INVALID_VERIFICATION');
        const result=await this.pool.query(`UPDATE guardian_consent_requests SET verification_method='external_vpc',verification_reference=$2,
          assurance_level='high',relationship_claim=COALESCE($3,relationship_claim),status='pending' WHERE id=$1 AND status IN ('pending','verification_required') AND expires_at>now() RETURNING assessment_id`,
        [requestId,sha256(verificationReference),relationship?String(relationship).slice(0,80):null]);
        if(!result.rows[0]) throw httpError(404,'Consent request is invalid or expired','CONSENT_REQUEST_EXPIRED');
        await this.event(this.pool,'guardian_verification_completed',context,{assessmentId:result.rows[0].assessment_id,consentRequestId:requestId},{},'system');
        return {status:'verified'};
    }

    async decideGuardianConsent({ decisionToken, decision, relationship, verificationMethod, verificationReference, optionalGrants = {} }, context = {}) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const found = await client.query(`SELECT r.*,a.required_path,a.ruleset_version,a.notice_version FROM guardian_consent_requests r
              JOIN privacy_age_assessments a ON a.id=r.assessment_id WHERE r.decision_token_hash=$1 FOR UPDATE`, [sha256(decisionToken)]);
            const row = found.rows[0];
            if (!row || row.expires_at <= new Date() || !['pending','verification_required'].includes(row.status)) throw httpError(404, 'Consent request is invalid or expired', 'CONSENT_REQUEST_EXPIRED');
            if (decision !== 'approve') {
                await client.query(`UPDATE guardian_consent_requests SET status='denied',decided_at=now() WHERE id=$1`, [row.id]);
                await this.event(client, 'guardian_denied', context, { assessmentId: row.assessment_id, consentRequestId: row.id }, {}, 'guardian');
                await client.query('COMMIT'); return { status: 'denied' };
            }
            const method = String(verificationMethod || '');
            const isDev = method === 'development_attestation' && this.config.allowDevGuardianApproval;
            const isVerified = row.verification_method === 'external_vpc' && !!row.verification_reference && !!this.config.vpcWebhookSecret;
            if (row.required_path === 'coppa_vpc' && !isVerified && !isDev) throw httpError(403, 'Verifiable parental consent is required', 'VPC_REQUIRED');
            if (!isVerified && !isDev) throw httpError(403, 'Guardian verification is required', 'GUARDIAN_VERIFICATION_REQUIRED');
            const managementToken = randomToken();
            await client.query(`UPDATE guardian_consent_requests SET status='approved',relationship_claim=$2,verification_method=$3,
              verification_reference=$4,assurance_level=$5,management_token_hash=$6,decided_at=now() WHERE id=$1`,
            [row.id, String(relationship || row.relationship_claim || 'parent_or_guardian').slice(0,80), isVerified ? 'external_vpc' : method,
                isVerified ? row.verification_reference : 'development-only', isVerified ? 'high' : 'development', sha256(managementToken)]);
            await client.query('UPDATE privacy_age_assessments SET guardian_approved_at=now() WHERE id=$1', [row.assessment_id]);
            await this.event(client, 'guardian_approved', context, { assessmentId: row.assessment_id, consentRequestId: row.id }, { optionalGrants }, 'guardian');
            await client.query('COMMIT');
            await this.notifier.guardianApproval({guardianEmail:row.guardian_email,managementUrl:`${this.config.frontendOrigin}/?guardianManage=${encodeURIComponent(managementToken)}`})
                .catch(error=>this.logger.error('privacy.guardian_approval_notice.failed',{consentRequestId:row.id,error}));
            return { status: 'approved', managementToken, approvedPurposes: sanitizeOptionalGrants(optionalGrants) };
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }

    async activateUserFromAssessment(client, userId, assessmentToken) {
        const a = await this.assessment(assessmentToken, { requireApproved: true, consume: true }, client);
        const privacyState = a.required_path === 'adult' ? 'adult_active' : 'minor_active';
        const nextAgeReview = nextAgeTransition(a.date_of_birth, a.age_years);
        await client.query(`UPDATE users SET country_code=$2,age_band=$3,date_of_birth=NULL,next_age_review_at=$4,privacy_state=$5,status='active',privacy_ruleset_version=$6,
          guardian_approved_at=$7,privacy_notice_version=$8,updated_at=now() WHERE id=$1`, [userId,a.country_code,a.age_band,nextAgeReview,privacyState,a.ruleset_version,a.guardian_approved_at,a.notice_version]);
        if (privacyState === 'minor_active') {
            const request = await client.query(`SELECT * FROM guardian_consent_requests WHERE assessment_id=$1 AND status='approved'`, [a.id]);
            const r = request.rows[0];
            const relation = await client.query(`INSERT INTO guardian_relationships
              (child_user_id,consent_request_id,guardian_email,relationship_claim,verified_method,assurance_level,verified_at)
              VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [userId,r.id,r.guardian_email,r.relationship_claim,r.verification_method,r.assurance_level,r.decided_at]);
            const approvedEvent = await client.query(`SELECT metadata FROM privacy_consent_events WHERE consent_request_id=$1 AND event_type='guardian_approved' ORDER BY id DESC LIMIT 1`, [r.id]);
            const optional = sanitizeOptionalGrants(approvedEvent.rows[0]?.metadata?.optionalGrants || {});
            for (const [purpose, granted] of Object.entries({ core_account: true, ...optional })) {
                await this.upsertGrant(client,userId,purpose,granted,'guardian',a.country_code,a.notice_version,a.ruleset_version,relation.rows[0].id);
            }
        } else await this.upsertGrant(client,userId,'core_account',true,'system_required',a.country_code,a.notice_version,a.ruleset_version,null);
        await client.query('UPDATE privacy_age_assessments SET consumed_at=now(),date_of_birth=NULL WHERE id=$1', [a.id]);
        await this.event(client, 'account_privacy_activated', {}, { userId, assessmentId: a.id }, { privacyState });
        return privacyState;
    }

    async upsertGrant(client,userId,purpose,granted,source,jurisdiction,notice,ruleset,relationshipId=null) {
        await client.query(`INSERT INTO privacy_consent_grants(user_id,guardian_relationship_id,purpose_code,granted,source,jurisdiction,notice_version,ruleset_version,withdrawn_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $4 THEN NULL ELSE now() END)
          ON CONFLICT(user_id,purpose_code) DO UPDATE SET granted=EXCLUDED.granted,source=EXCLUDED.source,guardian_relationship_id=EXCLUDED.guardian_relationship_id,
          notice_version=EXCLUDED.notice_version,ruleset_version=EXCLUDED.ruleset_version,granted_at=now(),withdrawn_at=CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END`,
        [userId,relationshipId,purpose,!!granted,source,jurisdiction,notice,ruleset]);
    }

    async privacyProfile(userId) {
        const user = await this.pool.query('SELECT id,country_code,age_band,privacy_state,privacy_ruleset_version,privacy_notice_version FROM users WHERE id=$1',[userId]);
        if (!user.rows[0]) throw httpError(404,'User not found','NOT_FOUND');
        const grantsResult = await this.pool.query('SELECT purpose_code,granted FROM privacy_consent_grants WHERE user_id=$1',[userId]);
        const grants=Object.fromEntries(grantsResult.rows.map(r=>[r.purpose_code,r.granted]));
        return { ...user.rows[0], grants, entitlements: entitlementsFor({privacyState:user.rows[0].privacy_state,grants}) };
    }

    async setPreferences(userId, choices, context={}) {
        const profile=await this.privacyProfile(userId); const minor=profile.privacy_state==='minor_active';
        const allowed=['optional_analytics','cloud_ai','chesscom_link','marketing','public_profile'];
        for (const purpose of allowed) {
            if (!(purpose in choices)) continue;
            if (minor && ['marketing','public_profile'].includes(purpose) && choices[purpose]) throw httpError(403,'This feature is unavailable for minor accounts','MINOR_FEATURE_BLOCKED');
            await this.upsertGrant(this.pool,userId,purpose,!!choices[purpose],'user',profile.country_code,profile.privacy_notice_version,profile.privacy_ruleset_version);
        }
        await this.event(this.pool,'privacy_preferences_updated',context,{userId},{purposes:Object.keys(choices)},'user');
        return this.privacyProfile(userId);
    }

    async requireEntitlement(userId, feature) {
        const profile=await this.privacyProfile(userId);
        if (!profile.entitlements[feature]) throw httpError(403,'Privacy approval is required for this feature','FEATURE_NOT_APPROVED');
        return profile;
    }

    async guardianProfile(managementToken) {
        const result=await this.pool.query(`SELECT r.id,r.status,r.requested_at,r.decided_at,r.revoked_at,a.age_band,a.country_code,
          u.id child_user_id,u.privacy_state FROM guardian_consent_requests r JOIN privacy_age_assessments a ON a.id=r.assessment_id
          LEFT JOIN guardian_relationships g ON g.consent_request_id=r.id LEFT JOIN users u ON u.id=g.child_user_id
          WHERE r.management_token_hash=$1`,[sha256(managementToken||'')]);
        if(!result.rows[0])throw httpError(404,'Guardian management link is invalid','NOT_FOUND');
        return result.rows[0];
    }

    async revokeGuardian(managementToken,context={}) {
        const client=await this.pool.connect();
        try{await client.query('BEGIN');const found=await client.query(`SELECT r.id,r.assessment_id,g.child_user_id FROM guardian_consent_requests r
          LEFT JOIN guardian_relationships g ON g.consent_request_id=r.id WHERE r.management_token_hash=$1 AND r.status='approved' FOR UPDATE`,[sha256(managementToken||'')]);
          const row=found.rows[0];if(!row)throw httpError(404,'Guardian approval is already inactive or invalid','NOT_FOUND');
          await client.query(`UPDATE guardian_consent_requests SET status='revoked',revoked_at=now() WHERE id=$1`,[row.id]);
          await client.query(`UPDATE privacy_age_assessments SET guardian_approved_at=NULL WHERE id=$1`,[row.assessment_id]);
          if(row.child_user_id){await client.query(`UPDATE guardian_relationships SET status='revoked',revoked_at=now() WHERE consent_request_id=$1`,[row.id]);
            await client.query(`UPDATE privacy_consent_grants SET granted=false,withdrawn_at=now() WHERE user_id=$1`,[row.child_user_id]);
            await client.query(`UPDATE users SET privacy_state='restricted',status='suspended',updated_at=now() WHERE id=$1`,[row.child_user_id]);
            await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,[row.child_user_id]);}
          await this.event(client,'guardian_revoked',context,{userId:row.child_user_id,assessmentId:row.assessment_id,consentRequestId:row.id},{},'guardian');
          await client.query('COMMIT');return{status:'revoked',accountRestricted:!!row.child_user_id};
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }

    async createRightsRequest(userId, requestType, context={}) {
        if(!['access','correct','restrict','object'].includes(requestType))throw httpError(400,'Unsupported privacy request','INVALID_REQUEST_TYPE');
        const result=await this.pool.query(`INSERT INTO privacy_requests(user_id,request_type,status,due_at) VALUES($1,$2,'received',now()+interval '30 days') RETURNING id,status,due_at,created_at`,[userId,requestType]);
        await this.event(this.pool,'privacy_rights_request_received',context,{userId},{type:requestType,privacyRequestId:result.rows[0].id},'user');return result.rows[0];
    }

    async processAgeTransitions(context={}) {
        const client=await this.pool.connect();const counts={to13:0,to16:0,to18:0};
        try{await client.query('BEGIN');const due=await client.query(`SELECT id,age_band,next_age_review_at FROM users WHERE next_age_review_at<=current_date AND privacy_state='minor_active' FOR UPDATE`);
          for(const user of due.rows){if(user.age_band==='under_13'){await client.query(`UPDATE users SET age_band='13_15',next_age_review_at=$2::date+interval '3 years',updated_at=now() WHERE id=$1`,[user.id,user.next_age_review_at]);counts.to13++;}
            else if(user.age_band==='13_15'){await client.query(`UPDATE users SET age_band='16_17',next_age_review_at=$2::date+interval '2 years',updated_at=now() WHERE id=$1`,[user.id,user.next_age_review_at]);counts.to16++;}
            else{await client.query(`UPDATE users SET age_band='adult',next_age_review_at=NULL,privacy_state='review_required',status='suspended',updated_at=now() WHERE id=$1`,[user.id]);await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,[user.id]);counts.to18++;}
            await this.event(client,'age_band_transitioned',context,{userId:user.id},{from:user.age_band},'system');}
          await client.query('COMMIT');return counts;
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }

    async exportUser(userId) {
        const [user,identities,games,training,grants,events,guardians]=await Promise.all([
            this.pool.query('SELECT id,email,display_name,picture_url,country_code,age_band,privacy_state,created_at,updated_at,last_login_at FROM users WHERE id=$1',[userId]),
            this.pool.query('SELECT provider,email,email_verified,created_at FROM auth_identities WHERE user_id=$1',[userId]),
            this.pool.query('SELECT * FROM games WHERE user_id=$1 ORDER BY created_at',[userId]),
            this.pool.query('SELECT profile,updated_at FROM training_profiles WHERE user_id=$1',[userId]),
            this.pool.query('SELECT purpose_code,granted,source,jurisdiction,notice_version,ruleset_version,granted_at,withdrawn_at FROM privacy_consent_grants WHERE user_id=$1',[userId]),
            this.pool.query('SELECT event_type,actor_type,ruleset_version,notice_version,metadata,occurred_at FROM privacy_consent_events WHERE user_id=$1 ORDER BY occurred_at',[userId]),
            this.pool.query('SELECT relationship_claim,status,verified_method,assurance_level,verified_at,revoked_at FROM guardian_relationships WHERE child_user_id=$1',[userId])]);
        return { exportedAt:new Date().toISOString(),formatVersion:1,user:user.rows[0],identities:identities.rows,games:games.rows,training:training.rows[0]||null,consents:grants.rows,consentEvents:events.rows,guardianRelationships:guardians.rows };
    }

    async deleteUser(userId, context={}) {
        const client=await this.pool.connect();
        let requestId;let subjectHash;
        try { await client.query('BEGIN');
            const found=await client.query('SELECT email FROM users WHERE id=$1 FOR UPDATE',[userId]);
            if(!found.rows[0]) throw httpError(404,'User not found','NOT_FOUND');
            const request=await client.query(`INSERT INTO privacy_requests(user_id,request_type,status,due_at) VALUES($1,'delete','processing',now()+interval '30 days') RETURNING id`,[userId]);
            await this.event(client,'deletion_requested',context,{userId},{privacyRequestId:request.rows[0].id},context.actorType==='guardian'?'guardian':'user');
            await client.query('UPDATE users SET privacy_state=\'deletion_pending\',status=\'deleted\',updated_at=now() WHERE id=$1',[userId]);
            await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
            subjectHash=sha256(found.rows[0].email.toLowerCase());
            await client.query(`UPDATE guardian_consent_requests SET guardian_email='deleted-'||left(guardian_email_hash,12)||'@invalid'
              WHERE id IN (SELECT consent_request_id FROM guardian_relationships WHERE child_user_id=$1)`,[userId]);
            await client.query('DELETE FROM users WHERE id=$1',[userId]);
            await client.query(`INSERT INTO privacy_deletion_tombstones(subject_hash,request_id,reason,expires_at) VALUES($1,$2,'user_request',now()+interval '6 years') ON CONFLICT(subject_hash) DO UPDATE SET request_id=EXCLUDED.request_id,created_at=now(),expires_at=EXCLUDED.expires_at`,[subjectHash,request.rows[0].id]);
            requestId=request.rows[0].id;
            await client.query('COMMIT');
        } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
        const fanout=await this.fanoutDeletion({requestId,subjectHash});
        const status=fanout.failed.length?'processing':'completed';
        await this.pool.query(`UPDATE privacy_requests SET status=$2,completed_at=CASE WHEN $2='completed' THEN now() ELSE NULL END,result=$3 WHERE id=$1`,[requestId,status,{primaryDatabase:'deleted',processorFanout:fanout}]);
        return {status,requestId,processorFanout:fanout};
    }

    async fanoutDeletion(payload){
        const result={completed:[],failed:[]};
        for(const url of this.config.deletionWebhookUrls){try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-privacy-event':'delete-subject',authorization:`Bearer ${this.config.deletionWebhookToken}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);result.completed.push(new URL(url).origin);}catch(error){result.failed.push({provider:new URL(url).origin,error:error.message});}}
        return result;
    }
}

function sanitizeOptionalGrants(input) {
    const safe={}; for(const k of ['optional_analytics','cloud_ai','chesscom_link']) safe[k]=input?.[k]===true; return safe;
}

function nextAgeTransition(dateValue, age) {
    if(!dateValue || age>=18)return null; const date=new Date(dateValue); const threshold=age<13?13:age<16?16:18;
    return `${date.getUTCFullYear()+threshold}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

module.exports = { PrivacyService, sha256, sanitizeOptionalGrants };
