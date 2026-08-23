import assert from "node:assert/strict";
import test from "node:test";
import { parseSsePayload, stripJsonFence } from "../ai/deepseek-client";

test("应解析 DeepSeek SSE 文本增量", () => {
  const result = parseSsePayload('{"choices":[{"delta":{"content":"你好"}}]}');
  assert.equal(result, "你好");
  assert.equal(parseSsePayload("[DONE]"), null);
});

test("应清理 JSON Markdown 围栏", () => {
  assert.equal(stripJsonFence("```json\n{\"ok\":true}\n```"), '{"ok":true}');
});
