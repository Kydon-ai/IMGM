const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronExecutable = require(path.join(projectRoot, 'node_modules', 'electron'));
const testsRoot = path.join(projectRoot, 'dist', 'tests');
const testFiles = fs.readdirSync(testsRoot)
  .filter((fileName) => fileName.endsWith('.test.js'))
  .sort()
  .map((fileName) => path.join(testsRoot, fileName));

if (testFiles.length === 0) {
  console.error(`No test files found in ${testsRoot}`);
  process.exit(1);
}

const result = spawnSync(electronExecutable, ['--test', ...testFiles], {
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
