import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekMessage, RagChatModel } from "../ai/deepseek-client";
import { ImageRetriever, ImageRagService } from "../ai/rag-workflow";
import { ImageSearchHit, SearchIntent } from "../ai/types";

class FakeModel implements RagChatModel {
  /** 返回固定检索意图。 */
  async completeJson<T>(): Promise<T> {
    return { shouldSearch: true, query: "咖波", category: "capoos" } as T;
  }

  /** 模拟两段流式回答。 */
  async streamText(_messages: DeepSeekMessage[], onChunk: (chunk: string) => void): Promise<string> {
    onChunk("找到");
    onChunk("了");
    return "找到了";
  }
}

class FakeRetriever implements ImageRetriever {
  lastIntent?: SearchIntent;

  /** 记录意图并返回一张测试图片。 */
  async search(intent: SearchIntent): Promise<ImageSearchHit[]> {
    this.lastIntent = intent;
    return [
      {
        id: "1",
        filePath: "C:\\images\\capoo.png",
        url: "file:///C:/images/capoo.png",
        fileName: "capoo.png",
        category: "capoos",
        tags: ["咖波"],
        description: "咖波图片",
        score: 1,
      },
    ];
  }
}

test("LangGraph 工作流应先检索再流式回答", async () => {
  const retriever = new FakeRetriever();
  const service = new ImageRagService(new FakeModel(), retriever);
  const events: string[] = [];
  const result = await service.ask(
    { requestId: "request-1", threadId: "thread-1", message: "找咖波", history: [] },
    (event) => events.push(event.type)
  );

  assert.equal(retriever.lastIntent?.category, "capoos");
  assert.equal(result.answer, "找到了");
  assert.equal(result.images.length, 1);
  assert.deepEqual(events, ["status", "status", "images", "status", "chunk", "chunk"]);
});
