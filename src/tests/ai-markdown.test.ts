import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import vm from "node:vm";

type MarkdownRendererApi = {
  markdownToHtml: (markdown: string) => string;
};

function getMarkdownRenderer(): MarkdownRendererApi {
  const source = fs.readFileSync(path.resolve(process.cwd(), "dist/ai-markdown.js"), "utf8");
  const context = { window: {} as { imgmMarkdownRenderer?: MarkdownRendererApi } };
  vm.runInNewContext(source, context);
  assert.ok(context.window.imgmMarkdownRenderer);
  return context.window.imgmMarkdownRenderer;
}

test("AI Markdown 渲染器应支持常用格式", () => {
  const html = getMarkdownRenderer().markdownToHtml([
    "## 检索结果",
    "",
    "找到 **3 张**图片：",
    "- 猫咪",
    "- *蓝色*背景",
    "",
    "```ts",
    "const answer = true;",
    "```",
    "",
    "[打开图片目录](https://example.com/images)",
  ].join("\n"));

  assert.match(html, /<h2>检索结果<\/h2>/);
  assert.match(html, /<strong>3 张<\/strong>/);
  assert.match(html, /<ul><li>猫咪<\/li><li><em>蓝色<\/em>背景<\/li><\/ul>/);
  assert.match(html, /<pre><code class="language-ts">const answer = true;<\/code><\/pre>/);
  assert.match(html, /<a href="https:\/\/example\.com\/images"/);
});

test("AI Markdown 渲染器不应执行原始 HTML 或危险链接", () => {
  const html = getMarkdownRenderer().markdownToHtml('<script>alert("xss")</script> [危险链接](javascript:alert(1))');

  assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /<script>/);
});
