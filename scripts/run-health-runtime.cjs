const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const useBuiltFile = existsSync('dist/healthRuntime.js');
const command = useBuiltFile ? process.execPath : 'npx';
const forwardedArgs = process.argv.slice(2);
const args = useBuiltFile
  ? ['dist/healthRuntime.js', ...forwardedArgs]
  : ['ts-node', 'src/healthRuntime.ts', ...forwardedArgs];
const healthTimeoutMs = Number.parseInt(process.env.SPARK_TELEGRAM_HEALTH_TIMEOUT_MS || '45000', 10) || 45000;

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32' && !useBuiltFile,
  timeout: healthTimeoutMs,
  killSignal: 'SIGTERM'
});

if (result.error) {
  if (result.error.code === 'ETIMEDOUT') {
    console.error(`Telegram runtime health timed out after ${healthTimeoutMs}ms.`);
    process.exit(124);
  }
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
