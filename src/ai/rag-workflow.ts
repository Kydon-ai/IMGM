import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { CATEGORY_KNOWLEDGE, detectCategory } from "./category-knowledge";
import { DeepSeekMessage, RagChatModel } from "./deepseek-client";
import { AiChatEvent, AiChatRequest, AiChatResponse, ImageSearchHit, SearchIntent } from "./types";

export interface ImageRetriever {
  search(intent: SearchIntent, limit?: number): Promise<ImageSearchHit[]>;
}

type EventEmitter = (event: AiChatEvent) => void;

const SearchIntentSchema = z.object({
  shouldSearch: z.boolean().optional(),
  query: z.string().optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  animated: z.boolean().optional(),
  transparent: z.boolean().optional(),
});

const RagState = Annotation.Root({
  request: Annotation<AiChatRequest>(),
  intent: Annotation<SearchIntent>(),
  images: Annotation<ImageSearchHit[]>(),
  answer: Annotation<string>(),
  emit: Annotation<EventEmitter>(),
});

/** 从用户原始文本中提取无需模型即可识别的搜索条件。 */
export function buildFallbackIntent(message: string): SearchIntent {
  const normalized = message.normalize("NFKC").toLowerCase();
  const color = ["黑色", "白色", "灰色", "红色", "橙色", "黄色", "绿色", "青色", "蓝色", "紫色", "粉色", "棕色"].find(
    (item) => normalized.includes(item)
  );
  const category = detectCategory(message);
  const hasSearchVerb = /找|搜索|检索|图片|头像|表情|素材|图标|看看/.test(message);
  return {
    shouldSearch: Boolean(category || color || hasSearchVerb),
    query: message,
    ...(category ? { category } : {}),
    ...(color ? { color } : {}),
    ...(/动图|gif/.test(normalized) ? { animated: true } : {}),
    ...(/静态图|不要动图/.test(normalized) ? { animated: false } : {}),
    ...(/透明|免抠/.test(normalized) ? { transparent: true } : {}),
  };
}

/** 合并模型意图与本地规则，并丢弃不存在的类别。 */
function normalizeIntent(message: string, modelIntent: unknown): SearchIntent {
  const fallback = buildFallbackIntent(message);
  const parsed = SearchIntentSchema.safeParse(modelIntent);
  if (!parsed.success) {
    return fallback;
  }
  const candidate = { ...fallback, ...parsed.data, query: parsed.data.query || message };
  if (candidate.category && !CATEGORY_KNOWLEDGE[candidate.category]) {
    candidate.category = fallback.category;
  }
  return candidate as SearchIntent;
}

/** 构建检索意图解析提示词。 */
function buildIntentMessages(message: string): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "你是图片检索意图解析器。只输出 JSON，字段为 shouldSearch、query、category、color、animated、transparent。" +
        ` category 只能取以下值之一或省略：${Object.keys(CATEGORY_KNOWLEDGE).join("、")}。` +
        "用户如果只是闲聊，shouldSearch=false；如果想找图片、头像、表情包或素材，则为 true。",
    },
    { role: "user", content: message },
  ];
}

/** 构建包含聊天历史和检索图片上下文的回答提示词。 */
function buildAnswerMessages(request: AiChatRequest, images: ImageSearchHit[]): DeepSeekMessage[] {
  const context = images.length
    ? images.map((item, index) => `${index + 1}. ${item.fileName}｜类别:${item.category}｜标签:${item.tags.join("、")}`).join("\n")
    : "本轮没有检索到图片。";
  return [
    {
      role: "system",
      content:
        "你是 IMGM 图片助手。结合检索结果简洁回答用户，并说明已在右侧展示匹配图片。" +
        "不要编造未提供的文件；如果没有结果，给出可执行的改写建议。\n\n检索上下文：\n" +
        context,
    },
    ...request.history.slice(-10),
    { role: "user", content: request.message },
  ];
}

/** 创建由 LangGraph 编排的图片 RAG 工作流。 */
export function createImageRagWorkflow(model: RagChatModel, retriever: ImageRetriever) {
  const analyzeIntent = async (state: typeof RagState.State): Promise<Partial<typeof RagState.State>> => {
    state.emit({ requestId: state.request.requestId, type: "status", message: "正在理解检索需求…" });
    try {
      const modelIntent = await model.completeJson<unknown>(buildIntentMessages(state.request.message));
      return { intent: normalizeIntent(state.request.message, modelIntent) };
    } catch {
      return { intent: buildFallbackIntent(state.request.message) };
    }
  };

  const retrieveImages = async (state: typeof RagState.State): Promise<Partial<typeof RagState.State>> => {
    if (!state.intent.shouldSearch) {
      return { images: [] };
    }
    state.emit({ requestId: state.request.requestId, type: "status", message: "正在 Milvus 中检索图片…" });
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
