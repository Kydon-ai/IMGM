const TEXT_MODEL_ID = "aurantium/clip-ViT-B-32-multilingual-v1";
const TEXT_MODEL_DTYPE = "q8" as const;

let tokenizer: any = null;
let textModel: any = null;
let initPromise: Promise<void> | null = null;
let transformers: any = null;

async function loadTransformers(): Promise<any> {
  transformers ||= await import("@huggingface/transformers");
  return transformers;
}

async function initTextModel(): Promise<void> {
  if (tokenizer && textModel) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const { AutoModel, AutoTokenizer } = await loadTransformers();
    console.error(`Loading SQLite search text model: ${TEXT_MODEL_ID}`);
    tokenizer = await AutoTokenizer.from_pretrained(TEXT_MODEL_ID);
    textModel = await AutoModel.from_pretrained(TEXT_MODEL_ID, {
      dtype: TEXT_MODEL_DTYPE,
    });
    console.error("SQLite search text model loaded");
  })().catch((error) => {
    initPromise = null;
    tokenizer = null;
    textModel = null;
    throw error;
  });

  return initPromise;
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
