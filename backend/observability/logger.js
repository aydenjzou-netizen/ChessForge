const crypto = require('crypto');

const SENSITIVE_FIELD = /authorization|cookie|password|secret|token|database_url|pgn|prompt|request_?body/i;

function safeValue(key, value) {
    if (SENSITIVE_FIELD.test(key)) return '[REDACTED]';
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            code: value.code
        };
    }
    if (Array.isArray(value)) return value.slice(0, 20).map(item => safeValue(key, item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, safeValue(childKey, childValue)]));
    }
    return value;
}

function write(level, event, fields = {}) {
    const record = {
        timestamp: new Date().toISOString(),
        level,
        service: 'chessforge-storage-api',
        event,
        ...safeValue('fields', fields)
    };
    const output = JSON.stringify(record);
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
}

const logger = {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields)
};

function requestContext(req, res, next) {
    const requestId = req.get('x-request-id') || crypto.randomUUID();
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        logger.info('http.request.completed', {
            requestId,
            userId: req.user && req.user.id,
            method: req.method,
            path: req.route && req.route.path ? req.route.path : req.path,
            statusCode: res.statusCode,
            latencyMs: Number(elapsedMs.toFixed(2))
        });
    });
    next();
}

module.exports = { logger, requestContext };
