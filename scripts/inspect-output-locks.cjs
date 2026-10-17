const path = require("node:path");
const { spawnSync } = require("node:child_process");
const projectRoot = path.resolve(__dirname, "..");

function inspectOutputLocks(outputDirectory) {
  if (process.platform !== "win32") {
    return true;
  }

  const scriptPath = path.join(__dirname, "inspect-output-locks.ps1");
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-OutputDirectory",
      outputDirectory,
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      windowsHide: true,
    },
  );

  if (result.error) {
    console.warn(`[handles] could not inspect output locks: ${result.error.message}`);
    return false;
  }
  if (result.status === 2) {
    console.warn("[handles] output files are in use; no applications were closed");
    return true;
  }
  if (result.status !== 0) {
    console.warn(`[handles] inspection exited with status ${result.status}; continuing with filesystem retries`);
    return false;
  }
  return true;
}

module.exports = { inspectOutputLocks };

if (require.main === module) {
  const requestedDirectory = process.argv[2];
  const allowedDirectories = [
    path.resolve(projectRoot, "out"),
    path.resolve(projectRoot, "out", "installer"),
  ];

  if (!requestedDirectory) {
    console.error("Usage: node scripts/inspect-output-locks.cjs out|out/installer");
    process.exitCode = 1;
  } else {
    const outputDirectory = path.resolve(projectRoot, requestedDirectory);
    if (!allowedDirectories.includes(outputDirectory)) {
      console.error("[handles] only out or out/installer may be scanned");
      process.exitCode = 1;
    } else if (!inspectOutputLocks(outputDirectory)) {
      process.exitCode = 1;
    }
  }
}
