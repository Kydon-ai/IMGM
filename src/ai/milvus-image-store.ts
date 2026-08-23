import { Document } from "@langchain/core/documents";
import { ConsistencyLevelEnum, DataType, ErrorCode, MilvusClient } from "@zilliz/milvus2-sdk-node";
import { pathToFileURL } from "url";
import { getCategoryFamily } from "./category-knowledge";
import { MetadataEmbeddings } from "./hash-embeddings";
import { ImageMetadata, ImageSearchHit, SearchIntent } from "./types";

export type MilvusImageStoreConfig = {
  address: string;
  collectionName: string;
  dimension?: number;
};

/** 转义 Milvus 过滤表达式中的字符串。 */
function escapeFilterString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 把图片元数据转换成 LangChain Document。 */
export function metadataToDocument(metadata: ImageMetadata): Document<ImageMetadata> {
  return new Document({ id: metadata.id, pageContent: metadata.searchText, metadata });
}

/** 根据结构化搜索意图生成 Milvus 标量过滤表达式。 */
export function buildMilvusFilter(intent: SearchIntent, split?: "train" | "test"): string | undefined {
  const filters: string[] = [];
  if (intent.category) {
    const family = getCategoryFamily(intent.category).map((item) => `"${escapeFilterString(item)}"`);
    filters.push(family.length === 1 ? `category == ${family[0]}` : `category in [${family.join(", ")}]`);
  }
  if (intent.color) {
    filters.push(`dominantColor == "${escapeFilterString(intent.color)}"`);
  }
  if (typeof intent.animated === "boolean") {
    filters.push(`animated == ${intent.animated}`);
  }
  if (typeof intent.transparent === "boolean") {
    filters.push(`transparent == ${intent.transparent}`);
  }
  if (split) {
    filters.push(`split == "${split}"`);
  }
  return filters.length ? filters.join(" and ") : undefined;
}

export class MilvusImageStore {
  private readonly client: MilvusClient;
  private readonly collectionName: string;
  private readonly embeddings: MetadataEmbeddings;

  constructor(config: MilvusImageStoreConfig) {
    this.client = new MilvusClient({ address: config.address });
    this.collectionName = config.collectionName;
    this.embeddings = new MetadataEmbeddings(config.dimension);
  }

  /** 检查 Milvus 服务是否健康。 */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.checkHealth();
      return Boolean(response.isHealthy);
    } catch {
      return false;
    }
  }

  /** 创建图片向量集合及余弦索引，已存在时直接加载。 */
  async ensureCollection(): Promise<void> {
    const exists = await this.client.hasCollection({ collection_name: this.collectionName });
    if (!exists.value) {
      await this.client.createCollection({
        collection_name: this.collectionName,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            is_primary_key: true,
            autoID: false,
            max_length: 64,
          },
          {
            name: "vector",
            data_type: DataType.FloatVector,
            dim: this.embeddings.dimension,
          },
        ],
        enable_dynamic_field: true,
        consistency_level: "Strong",
        index_params: {
          field_name: "vector",
          index_type: "AUTOINDEX",
          metric_type: "COSINE",
          params: {},
        },
      });
      return;
    }
    await this.client.loadCollectionSync({ collection_name: this.collectionName });
  }

  /** 删除并重建集合，用于完整、可重复的数据集索引。 */
  async recreateCollection(): Promise<void> {
    const exists = await this.client.hasCollection({ collection_name: this.collectionName });
    if (exists.value) {
      const status = await this.client.dropCollection({ collection_name: this.collectionName });
      if (status.error_code !== ErrorCode.SUCCESS) {
        throw new Error(`删除旧集合失败: ${status.reason}`);
      }
    }
    await this.ensureCollection();
  }

  /** 分批向量化并写入 Milvus，返回成功写入数量。 */
  async addImages(items: ImageMetadata[], batchSize = 200, onProgress?: (count: number) => void): Promise<number> {
    await this.ensureCollection();
    let inserted = 0;
    for (let start = 0; start < items.length; start += batchSize) {
      const batch = items.slice(start, start + batchSize);
      const documents = batch.map(metadataToDocument);
      const vectors = await this.embeddings.embedDocuments(documents.map((document) => document.pageContent));
      const response = await this.client.insert({
        collection_name: this.collectionName,
        data: documents.map((document, index) => ({
          id: document.id,
          vector: vectors[index],
          filePath: document.metadata.filePath,
          fileName: document.metadata.fileName,
          category: document.metadata.category,
          tagsJson: JSON.stringify(document.metadata.tags),
          searchText: document.pageContent,
          split: document.metadata.split,
          dominantColor: document.metadata.dominantColor,
          animated: document.metadata.animated,
          transparent: document.metadata.transparent,
        })),
      });
      if (response.status.error_code !== ErrorCode.SUCCESS) {
        throw new Error(`写入 Milvus 失败: ${response.status.reason}`);
      }
      inserted += Number(response.insert_cnt || batch.length);
      onProgress?.(inserted);
    }
    await this.client.flushSync({ collection_names: [this.collectionName] });
    return inserted;
  }

  /** 使用向量相似度与结构化过滤检索图片。 */
  async search(intent: SearchIntent, limit = 8, split?: "train" | "test"): Promise<ImageSearchHit[]> {
    await this.ensureCollection();
    const vector = await this.embeddings.embedQuery(intent.query);
    const filter = buildMilvusFilter(intent, split);
    const response = await this.client.search({
      collection_name: this.collectionName,
      data: vector,
      anns_field: "vector",
      metric_type: "COSINE",
      limit,
      ...(filter ? { filter } : {}),
      output_fields: ["filePath", "fileName", "category", "tagsJson", "searchText"],
      consistency_level: ConsistencyLevelEnum.Strong,
    });
    if (response.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(`Milvus 检索失败: ${response.status.reason}`);
    }

    return response.results.map((result) => ({
      id: String(result.id),
      filePath: String(result.filePath || ""),
      url: pathToFileURL(String(result.filePath || "")).href,
      fileName: String(result.fileName || ""),
      category: String(result.category || ""),
      tags: JSON.parse(String(result.tagsJson || "[]")) as string[],
      description: String(result.searchText || ""),
      score: Number(result.score || 0),
    }));
  }

  /** 关闭 Milvus 客户端连接。 */
  async close(): Promise<void> {
    await this.client.closeConnection();
  }
}
