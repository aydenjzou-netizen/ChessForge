const { createPool } = require('../config/database');
const { privacyConfig } = require('../privacy/config');
const { PrivacyService } = require('../privacy/service');
const { PrivacyNotifier } = require('../privacy/notifier');
const { logger } = require('../observability/logger');

async function main(){
  const pool=createPool();const config=privacyConfig();const service=new PrivacyService({pool,config,notifier:new PrivacyNotifier({config,logger}),logger});
  try{await service.cleanupExpired();const transitions=await service.processAgeTransitions();
    const authDays=Number(process.env.PRIVACY_SECURITY_LOG_RETENTION_DAYS||180);
    await pool.query(`DELETE FROM auth_audit_events WHERE occurred_at<now()-($1*interval '1 day')`,[authDays]);
    await pool.query(`DELETE FROM auth_sessions WHERE expires_at<now()-interval '7 days' OR revoked_at<now()-interval '30 days'`);
    logger.info('privacy.maintenance.completed',{transitions,authAuditRetentionDays:authDays});
  }finally{await pool.end();}
}
main().catch(error=>{logger.error('privacy.maintenance.failed',{error});process.exitCode=1;});
