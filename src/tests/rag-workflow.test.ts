import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekMessage, RagChatModel } from "../ai/deepseek-client";
import { buildFallbackIntent, ImageRetriever, ImageRagService } from "../ai/rag-workflow";
import { ImageSearchHit, SearchIntent } from "../ai/types";

class FakeModel implements RagChatModel {
  intentMessages?: DeepSeekMessage[];

  /** 返回固定检索意图。 */
  async completeJson<T>(messages: DeepSeekMessage[]): Promise<T> {
    this.intentMessages = messages;
    return {
      shouldSearch: true,
      query: "可爱的蓝色猫咪",
      category: "新增目录分类",
      color: "蓝色",
      animated: null,
      transparent: null,
    } as T;
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
  const model = new FakeModel();
  const service = new ImageRagService(model, retriever);
  const events: string[] = [];
  const result = await service.ask(
    {
      requestId: "request-1",
      threadId: "thread-1",
      message: "再找一张，要求透明背景",
      history: [
        { role: "user", content: "我想找一只猫咪" },
        { role: "assistant", content: "可以，我来帮你找猫咪图片。" },
        { role: "user", content: "最好是蓝色的，正在注视镜头" },
      ],
    },
    (event) => events.push(event.type)
  );

  assert.deepEqual(model.intentMessages?.slice(1), [
    { role: "user", content: "我想找一只猫咪" },
    { role: "assistant", content: "可以，我来帮你找猫咪图片。" },
    { role: "user", content: "最好是蓝色的，正在注视镜头" },
    { role: "user", content: "再找一张，要求透明背景" },
  ]);
  assert.equal(retriever.lastIntent?.category, "新增目录分类");
  assert.equal(retriever.lastIntent?.color, "蓝色");
  assert.equal(retriever.lastIntent?.query, "可爱的蓝色猫咪");
  assert.equal(result.answer, "找到了");
  assert.equal(result.images.length, 1);
  assert.deepEqual(events, ["status", "status", "images", "status", "chunk", "chunk"]);
});

test("LLM 意图解析失败时不再用本地关键词猜类别和颜色", () => {
  assert.deepEqual(buildFallbackIntent("找蓝色咖波"), {
    shouldSearch: false,
    query: "找蓝色咖波",
  });
});
