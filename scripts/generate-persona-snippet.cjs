const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const sparkCharacterRoot =
  process.env.SPARK_CHARACTER_ROOT || 'C:\\Users\\USER\\Desktop\\spark-character';
const python = process.env.PYTHON || 'python';
const renderer = path.join(sparkCharacterRoot, 'scripts', 'render_telegram_persona_snippet.py');
const out = path.join(repoRoot, 'src', 'generated', 'sparkPersonaSnippet.ts');

const env = {
  ...process.env,
  PYTHONPATH: path.join(sparkCharacterRoot, 'src'),
};

const result = spawnSync(python, [renderer, '--out', out], {
  cwd: sparkCharacterRoot,
  env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status || 1);
}
