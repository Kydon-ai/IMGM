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
  assert.match(html, /\.img-item\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(html, /<p id="ai-status" class="ai-status">/);
  assert.match(html, /<script src="\.\/dist\/ai-chat\.js"><\/script>/);
  assert.match(html, /id="add-embedding"/);
  assert.match(html, /id="embedding-index-dialog"/);
  assert.match(html, /id="embedding-index-progress"/);
  assert.match(html, /id="search-history-previous"/);
  assert.match(html, /id="search-history-next"/);
  assert.match(html, /id="ai-results-close"/);
  assert.match(html, /<form id="ai-form" class="ai-composer">\s*<section id="ai-results-section" class="ai-results-section">/);
  assert.equal((html.match(/<div class="img-item">/g) || []).length, 12, "图片展示槽位应为 12 个");

  const domSource = fs.readFileSync(path.resolve(process.cwd(), "src/dom.ts"), "utf8");
  assert.match(domSource, /querySelectorAll<HTMLButtonElement>\("\.imgm-nav-item"\)/);
  assert.match(domSource, /local: \{[^}]*pageSize: 8/);
  assert.match(domSource, /rir: \{[^}]*pageSize: 12/);
  assert.match(domSource, /activateLatestDirectorySearch/);
  assert.match(domSource, /appendSearchHistory/);

  const preloadSource = fs.readFileSync(path.resolve(process.cwd(), "src/preload.ts"), "utf8");
  assert.match(preloadSource, /local: \{[^}]*pageSize: 8/);
  assert.match(preloadSource, /rir: \{[^}]*pageSize: 12/);
  assert.match(preloadSource, /scanImageIndexGroups/);
  assert.match(preloadSource, /applyImageIndexSelection/);

  const chatSource = fs.readFileSync(path.resolve(process.cwd(), "src/ai-chat.ts"), "utf8");
  assert.match(chatSource, /setTimeout\(\(\) => \{[\s\S]*?5000/);
  assert.match(chatSource, /ai-replay-search/);
  assert.match(chatSource, /showResultsInMainGallery\(images\.slice\(\)\)/);

  assert.doesNotMatch(html, /rename-btn|改标签/);
  assert.doesNotMatch(domSource, /bindRenameActions|openRenameModel/);
  assert.doesNotMatch(preloadSource, /openRenameModel|rename-btn/);
});
