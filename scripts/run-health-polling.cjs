const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const useBuiltFile = existsSync('dist/healthPolling.js');
const command = useBuiltFile ? process.execPath : 'npx';
const args = useBuiltFile ? ['dist/healthPolling.js'] : ['ts-node', 'src/healthPolling.ts'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32' && !useBuiltFile
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
