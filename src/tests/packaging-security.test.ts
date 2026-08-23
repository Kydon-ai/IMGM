import assert from "node:assert/strict";
import test from "node:test";

const forgeConfig = require("../../forge.config.js") as { packagerConfig: { ignore: RegExp[] } };

/** 判断打包忽略规则是否命中指定相对路径。 */
function isIgnored(filePath: string): boolean {
  return forgeConfig.packagerConfig.ignore.some((pattern) => pattern.test(filePath));
}

test("打包时应排除密钥和本地 Milvus 数据", () => {
  assert.equal(isIgnored("/.env"), true);
  assert.equal(isIgnored("/data/dataset/images.jsonl"), true);
  assert.equal(isIgnored("/data/milvus/data/index"), true);
  assert.equal(isIgnored("/src/ai/config.ts"), true);
  assert.equal(isIgnored("/dist/main.js"), false);
  assert.equal(isIgnored("/index.html"), false);
});
