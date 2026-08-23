import { Embeddings } from "@langchain/core/embeddings";
import { getCategoryFeatures } from "./category-knowledge";

const DEFAULT_DIMENSION = 384;

/** 使用 FNV-1a 生成稳定的 32 位哈希。 */
function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 将中英文文本拆成词、汉字及相邻字符特征。 */
function tokenize(input: string): Array<{ token: string; weight: number }> {
  const normalized = input.normalize("NFKC").toLowerCase();
  const segments = normalized.match(/[\p{Script=Han}]+|[a-z0-9]+/gu) || [];
  const tokens: Array<{ token: string; weight: number }> = [];

  for (const segment of segments) {
    tokens.push({ token: segment, weight: 2.5 });
    if (/^[\p{Script=Han}]+$/u.test(segment)) {
      for (const character of segment) {
        tokens.push({ token: character, weight: 0.35 });
      }
      for (let index = 0; index < segment.length - 1; index += 1) {
        tokens.push({ token: segment.slice(index, index + 2), weight: 1.1 });
      }
    }
  }

  for (const feature of getCategoryFeatures(normalized)) {
    tokens.push({ token: feature.normalize("NFKC").toLowerCase(), weight: 5 });
  }

  return tokens;
}

/** 将向量归一化，便于使用余弦相似度检索。 */
function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export class MetadataEmbeddings extends Embeddings {
  readonly dimension: number;

  constructor(dimension = DEFAULT_DIMENSION) {
    super({ maxConcurrency: 8 });
    this.dimension = dimension;
  }

  /** 批量生成与 LangChain 兼容的本地元数据向量。 */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map((document) => this.embedText(document));
  }

  /** 生成单条查询向量。 */
  async embedQuery(document: string): Promise<number[]> {
    return this.embedText(document);
  }

  /** 使用特征哈希生成不依赖外部模型的语义向量。 */
  embedText(document: string): number[] {
    const vector = new Array<number>(this.dimension).fill(0);
    for (const { token, weight } of tokenize(document)) {
      const hash = hashToken(token);
      const index = hash % this.dimension;
      const sign = (hash & 0x80000000) === 0 ? 1 : -1;
      vector[index] += sign * weight;
    }
    return normalizeVector(vector);
  }
}

/** 计算两个等长向量的余弦相似度。 */
export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error("向量维度不一致");
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
}
