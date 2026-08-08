const { execFileSync, spawn } = require('child_process');
const path = require('path');

const host = process.env.AZURE_PG_HOST || 'chessforge.postgres.database.azure.com';
const user = process.env.AZURE_PG_USER || 'chessforge_app';
const database = process.env.AZURE_PG_DATABASE || 'chessforge';
const keychainService = process.env.AZURE_PG_KEYCHAIN_SERVICE || 'chessforge-azure-app';

function readPassword() {
    try {
        return execFileSync('security', [
            'find-generic-password', '-a', user, '-s', keychainService, '-w'
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        throw new Error(`Azure database password was not found in Keychain service ${keychainService}.`);
    }
}

const databaseUrl = new URL(`postgresql://${host}/${database}`);
databaseUrl.username = user;
databaseUrl.password = readPassword();
databaseUrl.searchParams.set('sslmode', 'verify-full');

const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
        ...process.env,
        STORAGE_MODE: 'postgres',
        DATABASE_URL: databaseUrl.toString(),
        DB_APPLICATION_NAME: process.env.DB_APPLICATION_NAME || 'chessforge-api-azure'
    },
    stdio: 'inherit'
});

child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
});
