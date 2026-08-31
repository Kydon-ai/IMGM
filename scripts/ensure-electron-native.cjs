const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronExecutable = require(path.join(projectRoot, 'node_modules', 'electron'));
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;

const probe = spawnSync(electronExecutable, ['-e', "require('better-sqlite3')"], {
  cwd: projectRoot,
  env: { ...cleanEnv, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
});

if (probe.status === 0) {
  console.log('Electron native modules are ready.');
  process.exit(0);
}

console.warn('better-sqlite3 is not compatible with the current Electron ABI; rebuilding it...');

const rebuildCommand = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', '.bin', 'electron-rebuild.cmd')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron-rebuild');
const rebuild = spawnSync(rebuildCommand, ['-f', '-w', 'better-sqlite3'], {
  cwd: projectRoot,
  env: cleanEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  windowsHide: true,
});

if (rebuild.status !== 0) {
  process.exit(rebuild.status ?? 1);
}
