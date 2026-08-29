import { configureTransformersEnv } from "../ai/transformers-config";

const SEGMENTATION_MODEL_ID = "Xenova/bert-base-chinese-ws";

const STOP_WORDS = new Set([
  "请",
  "帮",
  "我",
  "找",
  "搜索",
  "查询",
  "想要",
  "给我",
  "一个",
  "一张",
  "相关",
  "关于",
  "的",
  "表情包",
  "图片",
  "图",
  "看看",
]);

let segmenter: any = null;
let initPromise: Promise<void> | null = null;
let transformers: any = null;

async function loadTransformers(): Promise<any> {
  transformers ||= await import("@huggingface/transformers");
  configureTransformersEnv(transformers.env, false);
  return transformers;
}

async function initSegmenter(): Promise<void> {
  if (segmenter) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const { pipeline } = await loadTransformers();
    console.error(`Loading SQLite search tokenizer: ${SEGMENTATION_MODEL_ID}`);
    segmenter = await pipeline("token-classification", SEGMENTATION_MODEL_ID, {
      dtype: "q8",
      local_files_only: true,
    });
    console.error("SQLite search tokenizer loaded");
  })().catch((error) => {
    initPromise = null;
    segmenter = null;
    throw error;
  });

  return initPromise;
}

function normalizeToken(token: string): string {
  return token.normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
}

function isChineseSpan(value: string): boolean {
  return /^\p{Script=Han}+$/u.test(value);
}

async function segmentChineseSpan(span: string): Promise<string[]> {
  const output = await segmenter(span) as Array<{
    entity?: string;
    word?: string;
  }>;
  const words: string[] = [];
  let current = "";

  for (const item of output) {
    const word = (item.word ?? "").replace(/^##/, "");
    const entity = (item.entity ?? "").toUpperCase();
    if (!word) {
      continue;
    }
    if (entity.includes("B") && current) {
      words.push(current);
      current = "";
    }
    current += word;
    if (entity.includes("S") || entity.includes("E")) {
      words.push(current);
      current = "";
    }
  }

  if (current) {
    words.push(current);
  }
  return words;
}

/** 使用参考项目的中文分词策略，同时保留英文名称、版本号和连字符标识符。 */
export async function segmentQuery(query: string): Promise<string[]> {
  const pieces = query.normalize("NFKC").match(
    /[\p{Script=Han}]+|[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*/gu,
  ) ?? [];

  if (pieces.length === 0) {
    return [];
  }

  await initSegmenter();
  const tokens: string[] = [];
  for (const piece of pieces) {
    if (isChineseSpan(piece)) {
      tokens.push(...await segmentChineseSpan(piece));
    } else {
      tokens.push(piece);
    }
  }

  return [...new Set(tokens.map(normalizeToken).filter((token) => token.length > 0 && !STOP_WORDS.has(token)))];
}
