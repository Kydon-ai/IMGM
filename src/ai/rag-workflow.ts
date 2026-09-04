import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { DeepSeekMessage, RagChatModel } from "./deepseek-client";
import { AiChatEvent, AiChatRequest, AiChatResponse, ImageSearchHit, SearchIntent } from "./types";

export interface ImageRetriever {
  search(intent: SearchIntent, limit?: number): Promise<ImageSearchHit[]>;
}

type EventEmitter = (event: AiChatEvent) => void;

const SearchIntentSchema = z.object({
  shouldSearch: z.boolean().optional(),
  query: z.string().trim().min(1).optional().nullable(),
  category: z.string().trim().min(1).optional().nullable(),
  color: z.string().trim().min(1).optional().nullable(),
  animated: z.boolean().optional().nullable(),
  transparent: z.boolean().optional().nullable(),
});

const RagState = Annotation.Root({
  request: Annotation<AiChatRequest>(),
  intent: Annotation<SearchIntent>(),
  images: Annotation<ImageSearchHit[]>(),
  answer: Annotation<string>(),
  emit: Annotation<EventEmitter>(),
});

/** LLM 解析失败时只保留原始查询，不再使用本地关键词猜类别或颜色。 */
export function buildFallbackIntent(message: string): SearchIntent {
  const result: SearchIntent = {
    shouldSearch: true,
    query: message,
  };

  console.log("buildFallbackIntent result:",result)
  return result;
}

function cleanIntentValue(value: string | null | undefined): string | undefined {
  const cleaned = value?.normalize("NFKC").trim();
  return cleaned || undefined;
}

/** 校验 LLM 意图；类别和颜色使用自由文本，不依赖本地固定列表。 */
function normalizeIntent(message: string, modelIntent: unknown): SearchIntent {
  const parsed = SearchIntentSchema.safeParse(modelIntent);
  if (!parsed.success) {
    return buildFallbackIntent(message);
  }

  const category = cleanIntentValue(parsed.data.category);
  const color = cleanIntentValue(parsed.data.color);
  return {
    shouldSearch: parsed.data.shouldSearch ?? false,
    query: parsed.data.query || message,
    ...(category ? { category } : {}),
    ...(color ? { color } : {}),
    ...(typeof parsed.data.animated === "boolean" ? { animated: parsed.data.animated } : {}),
    ...(typeof parsed.data.transparent === "boolean" ? { transparent: parsed.data.transparent } : {}),
  };
}

/** 构建包含聊天历史的检索意图解析提示词。 */
function buildIntentMessages(request: AiChatRequest): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "你是图片检索意图解析器。必须只输出一个 json 对象，不要输出 Markdown、解释或对象之外的内容。" +
        'JSON 字段必须为 shouldSearch、query、category、color、animated、transparent；没有对应条件时使用 null。' +
        "请结合历史聊天记录和当前用户消息生成完整的检索意图。历史消息中仍然有效的条件要保留，当前消息提出的新条件优先覆盖冲突条件；" +
        "不要把助手的建议当成用户的搜索条件。query 应整合用户分散在多轮对话中的视觉描述；用户只是闲聊时 shouldSearch=false，否则为 true。",
    },
    ...request.history.slice(-20),
    { role: "user", content: request.message },
  ];
}

/** 构建包含聊天历史和检索图片上下文的回答提示词。 */
function buildAnswerMessages(request: AiChatRequest, images: ImageSearchHit[]): DeepSeekMessage[] {
  const context = images.length
    ? images.map((item, index) => `${index + 1}. ${item.fileName}｜类别:${item.category}｜标签:${item.tags.join("、")}`).join("\n")
    : "本轮没有检索到图片。";
  const answer_messages: DeepSeekMessage[] = [
    {
      role: "system",
      content:
        "你是 IMGM 图片助手。结合检索结果简洁回答用户，并说明已在左侧尽可能展示最匹配的图片。" +
        "并对搜索结果进行轻微的总结。\n\n检索上下文：\n" +
        context,
    },
    ...request.history.slice(-20),
    { role: "user", content: request.message },
  ];
  console.log("重新整理消息：",answer_messages)
  return answer_messages
}

/** 创建由 LangGraph 编排的图片 RAG 工作流。 */
export function createImageRagWorkflow(model: RagChatModel, retriever: ImageRetriever) {
  const analyzeIntent = async (state: typeof RagState.State): Promise<Partial<typeof RagState.State>> => {
    state.emit({ requestId: state.request.requestId, type: "status", message: "正在理解检索需求…" });
    try {
      const modelIntent = await model.completeJson<unknown>(buildIntentMessages(state.request));
      return { intent: normalizeIntent(state.request.message, modelIntent) };
    } catch {
      return { intent: buildFallbackIntent(state.request.message) };
    }
  };

  const retrieveImages = async (state: typeof RagState.State): Promise<Partial<typeof RagState.State>> => {
    if (!state.intent.shouldSearch) {
      console.log("not should sesarch!!!")
      return { images: [] };
    }
    console.log("should be sesarched!!!",state.intent)
    state.emit({ requestId: state.request.requestId, type: "status", message: "正在 SQLite 中检索图片…" });
    const images = await retriever.search(state.intent, 8);
    state.emit({ requestId: state.request.requestId, type: "images", images });
    return { images };
  };

  const answerQuestion = async (state: typeof RagState.State): Promise<Partial<typeof RagState.State>> => {
    state.emit({ requestId: state.request.requestId, type: "status", message: "DeepSeek 正在组织回答…" });
    const answer = await model.streamText(buildAnswerMessages(state.request, state.images), (chunk) => {
      state.emit({ requestId: state.request.requestId, type: "chunk", chunk });
    });
    return { answer };
  };

  return new StateGraph(RagState)
    .addNode("analyze_intent", analyzeIntent)
    .addNode("retrieve_images", retrieveImages)
    .addNode("answer_question", answerQuestion)
    .addEdge(START, "analyze_intent")
    .addEdge("analyze_intent", "retrieve_images")
    .addEdge("retrieve_images", "answer_question")
    .addEdge("answer_question", END)
    .compile();
}

export class ImageRagService {
  private readonly workflow: ReturnType<typeof createImageRagWorkflow>;

  constructor(model: RagChatModel, retriever: ImageRetriever) {
    this.workflow = createImageRagWorkflow(model, retriever);
  }

  /** 执行一次带检索与流式事件的对话。 */
  async ask(request: AiChatRequest, emit: EventEmitter): Promise<AiChatResponse> {
    const result = await this.workflow.invoke({
      request,
      intent: buildFallbackIntent(request.message),
      images: [],
      answer: "",
      emit,
    });
    return { requestId: request.requestId, answer: result.answer, images: result.images };
  }
}
