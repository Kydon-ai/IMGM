import { getAiConfig } from "../ai/config";
import { configureTransformersEnv } from "../ai/transformers-config";

export const DEFAULT_TEXT_MODEL_ID = "aurantium/clip-ViT-B-32-multilingual-v1";
export const DEFAULT_IMAGE_MODEL_ID = "Xenova/clip-vit-base-patch32";
const MODEL_DTYPE = "q8" as const;

let tokenizer: any = null;
let textModel: any = null;
let processor: any = null;
let visionModel: any = null;
let textInitPromise: Promise<void> | null = null;
let visionInitPromise: Promise<void> | null = null;
let transformers: any = null;

export function getTextModelId(): string {
  return getAiConfig().textModelId || DEFAULT_TEXT_MODEL_ID;
}

export function getImageModelId(): string {
  return getAiConfig().imageModelId || DEFAULT_IMAGE_MODEL_ID;
}

async function loadTransformers(): Promise<any> {
  transformers ||= await import("@huggingface/transformers");
  configureTransformersEnv(transformers.env, false);
  return transformers;
}

async function initTextModel(): Promise<void> {
  if (tokenizer && textModel) {
    return;
  }

  if (textInitPromise) {
    return textInitPromise;
  }

  textInitPromise = (async () => {
    const { AutoModel, AutoTokenizer } = await loadTransformers();
    const modelId = getTextModelId();
    console.error(`Loading SQLite search text model: ${modelId}`);
    tokenizer = await AutoTokenizer.from_pretrained(modelId, { local_files_only: true });
    textModel = await AutoModel.from_pretrained(modelId, {
      dtype: MODEL_DTYPE,
      local_files_only: true,
    });
    console.error("SQLite search text model loaded");
  })().catch((error) => {
    textInitPromise = null;
    tokenizer = null;
    textModel = null;
    throw error;
  });

  return textInitPromise;
}

async function initVisionModel(): Promise<void> {
  if (processor && visionModel) {
    return;
  }

  if (visionInitPromise) {
    return visionInitPromise;
  }

  visionInitPromise = (async () => {
    const { AutoProcessor, CLIPVisionModelWithProjection } = await loadTransformers();
    const modelId = getImageModelId();
    console.error(`Loading SQLite search image model: ${modelId}`);
    processor = await AutoProcessor.from_pretrained(modelId, { local_files_only: true });
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(modelId, {
      dtype: MODEL_DTYPE,
      local_files_only: true,
    });
    console.error("SQLite search image model loaded");
  })().catch((error) => {
    visionInitPromise = null;
    processor = null;
    visionModel = null;
    throw error;
  });

  return visionInitPromise;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

/** 为 SQLite 中参考项目保存的 CLIP 向量生成同空间的文本查询向量。 */
export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedTexts([text]);
  return vectors[0] || [];
}

/** Generate a normalized visual embedding in the same CLIP space as embedText. */
export async function embedImage(imagePath: string): Promise<number[]> {
  await initVisionModel();

  const { RawImage } = await loadTransformers();
  const image = await RawImage.read(imagePath);
  const inputs = await processor(image);
  const output = await visionModel(inputs);
  const vector = Array.from(output.image_embeds.data) as number[];
  return normalize(vector);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  await initTextModel();
  const inputs = await tokenizer(texts, { padding: true, truncation: true });
  const output = await textModel(inputs);
  const data = Array.from(output.sentence_embedding.data) as number[];
  const dimensions = output.sentence_embedding.dims?.at(-1) ?? data.length / texts.length;
  const vectors: number[][] = [];

  for (let index = 0; index < texts.length; index += 1) {
    const start = index * dimensions;
    vectors.push(normalize(data.slice(start, start + dimensions)));
  }

  return vectors;
}
