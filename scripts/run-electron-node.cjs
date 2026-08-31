const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronExecutable = require(path.join(projectRoot, 'node_modules', 'electron'));
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Missing Electron Node arguments.');
  process.exit(1);
}

const result = spawnSync(electronExecutable, args, {
  cwd: projectRoot,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
