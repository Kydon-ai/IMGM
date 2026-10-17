const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { rimraf } = require("rimraf");
const { inspectOutputLocks } = require("./inspect-output-locks.cjs");

const projectRoot = path.resolve(__dirname, "..");
const defaultOutput = path.resolve(projectRoot, "out", "installer");

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function toBuilderOutputArg(outputDirectory) {
  return path.relative(projectRoot, outputDirectory).replace(/\\/g, "/");
}

async function prepareOutputDirectory() {
  inspectOutputLocks(defaultOutput);

  try {
    await rimraf(defaultOutput, {
      maxRetries: 20,
      backoff: 1.5,
      maxBackoff: 1000,
    });
    console.log(`[make:win] cleaned ${toBuilderOutputArg(defaultOutput)}`);
    return defaultOutput;
  } catch (error) {
    const fallbackOutput = path.resolve(
      projectRoot,
      "out",
      `installer-retry-${formatTimestamp(new Date())}-${process.pid}`,
    );
    console.warn(`[make:win] default output is locked: ${error.message}`);
    console.warn(`[make:win] using ${toBuilderOutputArg(fallbackOutput)} instead`);
    return fallbackOutput;
  }
}

async function main() {
  const outputDirectory = await prepareOutputDirectory();
  const builderCommand = process.platform === "win32"
    ? path.join(projectRoot, "node_modules", ".bin", "electron-builder.cmd")
    : path.join(projectRoot, "node_modules", ".bin", "electron-builder");
  const builderArgs = [
    "--win",
    "nsis",
    "zip",
    "--publish",
    "never",
    `--config.directories.output=${toBuilderOutputArg(outputDirectory)}`,
  ];

  const result = spawnSync(builderCommand, builderArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(`[make:win] failed: ${error.message}`);
  process.exitCode = 1;
});
