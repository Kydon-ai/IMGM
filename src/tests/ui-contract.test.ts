import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("AI 面板必需元素和脚本应只出现一次", () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
  const requiredIds = ["ai-status", "ai-messages", "ai-results", "ai-show-gallery", "ai-form", "ai-input", "ai-send"];

  for (const id of requiredIds) {
    const matches = html.match(new RegExp(`id=["']${id}["']`, "g")) || [];
    assert.equal(matches.length, 1, `${id} 应只出现一次`);
  }
  assert.match(html, /<aside class="ai-panel"/);
  assert.match(html, /<script src="\.\/dist\/ai-chat\.js"><\/script>/);
});
