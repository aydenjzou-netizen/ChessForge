function privacyConfig(env = process.env) {
    const nodeEnv=env.NODE_ENV || 'development';
    const origin = new URL(env.FRONTEND_ORIGIN).origin;
    const assessmentTtlMinutes=Number(env.PRIVACY_ASSESSMENT_TTL_MINUTES || 60);
    const consentTtlHours=Number(env.PRIVACY_CONSENT_TTL_HOURS || 72);
    if(!Number.isSafeInteger(assessmentTtlMinutes)||assessmentTtlMinutes<10||assessmentTtlMinutes>1440)throw new Error('PRIVACY_ASSESSMENT_TTL_MINUTES must be between 10 and 1440');
    if(!Number.isSafeInteger(consentTtlHours)||consentTtlHours<1||consentTtlHours>168)throw new Error('PRIVACY_CONSENT_TTL_HOURS must be between 1 and 168');
    const deletionWebhookUrls=String(env.PRIVACY_DELETION_WEBHOOK_URLS || '').split(',').map(value=>value.trim()).filter(Boolean);
    for(const url of deletionWebhookUrls){const parsed=new URL(url);if(parsed.protocol!=='https:'&&nodeEnv==='production')throw new Error('Production deletion webhooks must use HTTPS');}
    const operatorName=String(env.PRIVACY_OPERATOR_NAME||'ChessForge development').trim();
    const contactEmail=String(env.PRIVACY_CONTACT_EMAIL||'privacy-not-configured@invalid').trim();
    if(nodeEnv==='production'){
        for(const name of ['PRIVACY_OPERATOR_NAME','PRIVACY_CONTACT_EMAIL','PRIVACY_EMAIL_WEBHOOK_URL','PRIVACY_EMAIL_WEBHOOK_TOKEN','PRIVACY_VPC_START_URL','PRIVACY_VPC_WEBHOOK_SECRET'])if(!String(env[name]||'').trim())throw new Error(`${name} is required in production`);
        for(const name of ['PRIVACY_NOTICE_URL','PRIVACY_EMAIL_WEBHOOK_URL','PRIVACY_VPC_START_URL'])if(new URL(env[name]).protocol!=='https:')throw new Error(`${name} must use HTTPS in production`);
        if(deletionWebhookUrls.length&&!String(env.PRIVACY_DELETION_WEBHOOK_TOKEN||'').trim())throw new Error('PRIVACY_DELETION_WEBHOOK_TOKEN is required when deletion webhooks are configured');
    }
    return Object.freeze({
        nodeEnv,
        operatorName,
        contactEmail,
        frontendOrigin: origin,
        privacyNoticeUrl: env.PRIVACY_NOTICE_URL || `${origin}/privacy.html`,
        assessmentTtlMinutes,
        consentTtlHours,
        allowDevGuardianApproval: env.PRIVACY_ALLOW_DEV_GUARDIAN_APPROVAL === 'true' && (env.NODE_ENV || 'development') !== 'production',
        vpcWebhookSecret: env.PRIVACY_VPC_WEBHOOK_SECRET || '',
        vpcStartUrl: env.PRIVACY_VPC_START_URL || '',
        emailWebhookUrl: env.PRIVACY_EMAIL_WEBHOOK_URL || '',
        emailWebhookToken: env.PRIVACY_EMAIL_WEBHOOK_TOKEN || '',
        deletionWebhookUrls,
        deletionWebhookToken:env.PRIVACY_DELETION_WEBHOOK_TOKEN||''
    });
}
module.exports = { privacyConfig };
