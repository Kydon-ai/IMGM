import { AiConfig } from "./config";
import { ChatHistoryMessage } from "./types";

export type DeepSeekMessage = ChatHistoryMessage | { role: "system"; content: string };

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
};

export interface RagChatModel {
  completeJson<T>(messages: DeepSeekMessage[]): Promise<T>;
  streamText(messages: DeepSeekMessage[], onChunk: (chunk: string) => void): Promise<string>;
}

/** 从 SSE data 行中解析 DeepSeek 文本增量。 */
export function parseSsePayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === "[DONE]") {
    return null;
  }
  const chunk = JSON.parse(trimmed) as ChatCompletionChunk;
  return chunk.choices?.[0]?.delta?.content || null;
}

/** 清理大模型可能附带的 Markdown 代码围栏。 */
export function stripJsonFence(content: string): string {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export class DeepSeekClient implements RagChatModel {
  constructor(private readonly config: AiConfig) {}

  /** 请求 DeepSeek 返回结构化 JSON。 */
  async completeJson<T>(messages: DeepSeekMessage[]): Promise<T> {
    const response = await this.request({
      messages,
      stream: false,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const result = (await response.json()) as ChatCompletionResponse;
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek 未返回可解析内容");
    }
    return JSON.parse(stripJsonFence(content)) as T;
  }

  /** 通过 SSE 流式读取 DeepSeek 回答。 */
  async streamText(messages: DeepSeekMessage[], onChunk: (chunk: string) => void): Promise<string> {
    const response = await this.request({ messages, stream: true, temperature: 0.5 });
    if (!response.body) {
      throw new Error("DeepSeek 流式响应为空");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const chunk = parseSsePayload(line.slice(5));
        if (chunk) {
          answer += chunk;
          onChunk(chunk);
        }
      }
      if (done) {
        break;
      }
    }
    return answer;
  }

  /** 发送兼容 OpenAI 协议的聊天补全请求。 */
  private async request(body: Record<string, unknown>): Promise<Response> {
    const response = await fetch(`${this.config.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.config.deepseekModel, ...body }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      const errorBody = (await response.text()).slice(0, 500);
      throw new Error(`DeepSeek 请求失败 (${response.status}): ${errorBody}`);
    }
    return response;
  }
}
