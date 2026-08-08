class PrivacyNotifier {
    constructor({ config, logger }) { this.config = config; this.logger = logger; }

    async guardianNotice({ guardianEmail, decisionUrl, childAgeBand, expiresAt }) {
        const payload = {
            to: guardianEmail,
            template: 'guardian-consent-request',
            variables: { decisionUrl, childAgeBand, expiresAt, privacyUrl: this.config.privacyNoticeUrl,
                operatorName:this.config.operatorName,contactEmail:this.config.contactEmail,
                dataCategories:['account identity','age group and country','chess games','puzzle and training progress','security logs'],
                purposes:['create and secure the account','provide chess analysis and training','honor privacy choices'],
                disclosures:['approved hosting and database processors','email and guardian verification providers'],
                parentRights:['review','withdraw consent','export','correct','delete'] }
        };
        if (this.config.emailWebhookUrl) {
            const response = await fetch(this.config.emailWebhookUrl, {
                method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.emailWebhookToken}` },
                body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error(`Privacy email provider returned ${response.status}`);
            return;
        }
        if (this.config.nodeEnv === 'production') throw new Error('PRIVACY_EMAIL_WEBHOOK_URL is required in production');
        this.logger.info('privacy.guardian_notice.development', { guardianEmailHashOnly: true, childAgeBand });
    }

    async guardianApproval({ guardianEmail, managementUrl }) {
        const payload={to:guardianEmail,template:'guardian-consent-approved',variables:{managementUrl,privacyUrl:this.config.privacyNoticeUrl}};
        if(this.config.emailWebhookUrl){const response=await fetch(this.config.emailWebhookUrl,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.config.emailWebhookToken}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Privacy email provider returned ${response.status}`);return;}
        if(this.config.nodeEnv==='production')throw new Error('PRIVACY_EMAIL_WEBHOOK_URL is required in production');
        this.logger.info('privacy.guardian_approval.development',{guardianEmailHashOnly:true});
    }
}

module.exports = { PrivacyNotifier };
