const path = require("node:path");
const { rimraf } = require("rimraf");
const { inspectOutputLocks } = require("./inspect-output-locks.cjs");

const projectRoot = path.resolve(__dirname, "..");

// 只允许清理这些项目生成目录；新增目录时必须显式加入白名单。
const ALLOWED_TARGETS = new Set([
  "dist",
  "out",
  "data",
  "node_modules",
]);

const requestedTargets = process.argv.slice(2).map((value) =>
  String(value).trim().replace(/[\\/]+$/, ""),
);

function fail(message) {
  console.error(`[clean] ${message}`);
  console.error(`[clean] allowed targets: ${[...ALLOWED_TARGETS].join(", ")}`);
  process.exitCode = 1;
}

const targets = requestedTargets.length > 0
  ? requestedTargets
  : ["out", "dist"];

for (const input of targets) {
  if (!input) {
    fail("目录名不能为空");
    return;
  }
  if (path.isAbsolute(input) || input.includes("/") || input.includes("\\")) {
    fail("只允许传入项目根目录下的白名单目录名，不允许绝对路径或多级路径");
    return;
  }
  if (!ALLOWED_TARGETS.has(input)) {
    fail(`目录不在清理白名单中：${input}`);
    return;
  }
}

async function cleanTargets() {
  for (const input of targets) {
    const target = path.resolve(projectRoot, input);
    const relativeTarget = path.relative(projectRoot, target);

    if (!relativeTarget || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      fail("清理目标越过了项目根目录");
      return;
    }

    console.log(`[clean] removing ${input} ...`);
    if (input === "out") {
      inspectOutputLocks(target);
    }

    try {
      await rimraf(target, {
        maxRetries: 20,
        backoff: 1.5,
        maxBackoff: 1000,
      });
      console.log(`[clean] removed ${input}`);
    } catch (error) {
      console.error(`[clean] failed to remove ${input}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

cleanTargets();
