import { ipcMain } from "electron";
import { assertDeepSeekConfigured, getAiConfig } from "./config";
import { DeepSeekClient } from "./deepseek-client";
import { SqliteImageStore } from "./sqlite-image-store";
import { ImageRagService, ImageRetriever } from "./rag-workflow";
import { AiChatEvent, AiChatRequest, ImageSearchHit } from "./types";

type AiRuntime = {
  service: ImageRagService;
  store: SqliteImageStore;
};

let runtimePromise: Promise<AiRuntime> | null = null;

/** 延迟初始化 DeepSeek、SQLite 和 LangGraph 运行时。 */
async function createRuntime(): Promise<AiRuntime> {
  const config = getAiConfig();
  assertDeepSeekConfigured(config);
  const store = new SqliteImageStore({ databasePath: config.imageDbPath });
  const model = new DeepSeekClient(config);
  const retriever: ImageRetriever = {
    search: async (intent, limit): Promise<ImageSearchHit[]> =>
      store.search(intent.query, limit, {
        extraQuery: [intent.category, intent.color].filter(Boolean).join(" "),
      }),
  };
  return { service: new ImageRagService(model, retriever), store };
}

/** 获取可复用的 AI 运行时，失败后允许下一次请求重试。 */
async function getRuntime(): Promise<AiRuntime> {
  if (!runtimePromise) {
    runtimePromise = createRuntime().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/** 校验来自渲染进程的聊天请求。 */
function validateRequest(value: unknown): AiChatRequest {
  const request = value as Partial<AiChatRequest> | null;
  if (!request || typeof request.requestId !== "string" || typeof request.threadId !== "string" || typeof request.message !== "string") {
    throw new Error("AI 聊天请求格式不正确");
  }
  const history = Array.isArray(request.history)
    ? request.history
        .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
        .slice(-20)
        .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }))
    : [];
  return { requestId: request.requestId, threadId: request.threadId, message: request.message.slice(0, 2000), history };
}

/** 注册 AI 对话 IPC，并把检索和回答进度推送给请求页面。 */
export function registerAiIpc(): void {
  ipcMain.handle("aiAsk", async (event, rawRequest: unknown) => {
    const request = validateRequest(rawRequest);
    const emit = (chatEvent: AiChatEvent): void => event.sender.send("aiChatEvent", chatEvent);
    try {
      const runtime = await getRuntime();
      const response = await runtime.service.ask(request, emit);
      emit({ requestId: request.requestId, type: "done" });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ requestId: request.requestId, type: "error", message });
      throw error;
    }
  });
}

/** 在应用退出时关闭 SQLite 连接。 */
export async function closeAiRuntime(): Promise<void> {
  if (!runtimePromise) {
    return;
  }
  const runtime = await runtimePromise.catch(() => null);
  runtimePromise = null;
  await runtime?.store.close();
}
