import assert from "node:assert/strict";
import test from "node:test";
import { extractJsonObject, parseJsonObject, parseSsePayload, stripJsonFence } from "../ai/deepseek-client";

test("应解析 DeepSeek SSE 文本增量", () => {
  const result = parseSsePayload('{"choices":[{"delta":{"content":"你好"}}]}');
  assert.equal(result, "你好");
  assert.equal(parseSsePayload("[DONE]"), null);
});

test("应清理 JSON Markdown 围栏", () => {
  assert.equal(stripJsonFence("```json\n{\"ok\":true}\n```"), '{"ok":true}');
});

test("应从 JSON 前后的模型文本中提取完整对象", () => {
  const content = '下面是解析结果：{ "category": "capoos", "color": "蓝色", "query": "猫咪" }以上。';
  assert.equal(extractJsonObject(content), '{ "category": "capoos", "color": "蓝色", "query": "猫咪" }');
  assert.deepEqual(parseJsonObject(content), { category: "capoos", color: "蓝色", query: "猫咪" });
});
