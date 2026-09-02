import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { embedText } from "./sqlite-embedding";
import { segmentQuery } from "./sqlite-query-segmentation";

export type SqliteImageStoreConfig = {
  databasePath: string;
};

export type SqliteSearchScores = {
  name: number;
  image: number;
  vector: number;
  keyword: number;
};

export type SqliteImageSearchHit = {
  id: string;
  originalFilename: string;
  name: string;
  category: string;
  imagePath: string;
  filePath: string;
  url: string;
  fileName: string;
  tags: string[];
  description: string;
  score: number;
  scores: SqliteSearchScores;
  matchedKeywords: string[];
};

type ImageRow = {
  id: number;
  original_filename: string;
  name: string;
  category: string;
  image_path: string;
  image_embedding: Buffer | null;
  name_embedding: Buffer | null;
};

type PreparedSearchItem = ImageRow & {
  nameScore: number;
  imageScore: number;
  keywordScore: number;
  matchedKeywords: string[];
};

const DEFAULT_VECTOR_WEIGHTS = {
  name: 0.3,
  vector: 0.05,
};

/** 创建图片检索所需的最小 SQLite 结构。 */
function createImageSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY,
      original_filename TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_path TEXT NOT NULL,
      embedding BLOB NOT NULL,
      image_embedding BLOB,
      name_embedding BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_images_path ON images(image_path);
    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
  `);
}

/** 首次使用时创建空数据库；已有数据库不会被覆盖。 */
function ensureImageDatabase(databasePath: string): void {
  if (fs.existsSync(databasePath)) {
    return;
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    createImageSchema(database);
  } finally {
    database.close();
  }
}

function bufferToVector(buffer: Buffer | null): number[] {
  if (!buffer || buffer.byteLength === 0) {
    return [];
  }

  const copy = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return Array.from(new Float32Array(copy));
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
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
  if (denominator === 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, (dot / denominator + 1) / 2));
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function hasChineseOverlap(keyword: string, name: string): boolean {
  if (keyword.length < 3) {
    return false;
  }

  const maxLength = Math.min(3, keyword.length - 1);
  for (let length = maxLength; length >= 2; length -= 1) {
    for (let start = 0; start + length <= keyword.length; start += 1) {
      if (name.includes(keyword.slice(start, start + length))) {
        return true;
      }
    }
  }

  return false;
}

function keywordScore(keywords: string[], name: string): {
  score: number;
  matchedKeywords: string[];
} {
  const normalizedName = normalizeSearchText(name);
  const normalizedKeywords = [...new Set(keywords.map(normalizeSearchText).filter(Boolean))];
  if (normalizedKeywords.length === 0) {
    return { score: 0, matchedKeywords: [] };
  }

  const matchedKeywords = normalizedKeywords.filter((keyword) =>
    normalizedName.includes(keyword) ||
    (/^\p{Script=Han}+$/u.test(keyword) && hasChineseOverlap(keyword, normalizedName)),
  );

  return {
    score: matchedKeywords.length / normalizedKeywords.length,
    matchedKeywords,
  };
}

function resolveImagePath(imagePath: string, databasePath: string): string {
  if (path.isAbsolute(imagePath)) {
    return imagePath;
  }

  const candidates = [
    path.resolve(process.cwd(), imagePath),
    path.resolve(path.dirname(databasePath), imagePath),
    path.resolve(path.dirname(databasePath), "..", imagePath),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export class SqliteImageStore {
  private readonly db: Database.Database;
  private readonly databasePath: string;
  private readonly hasCategoryColumn: boolean;
  private readonly hasOriginalFilenameColumn: boolean;
  private readonly hasImageEmbeddingColumn: boolean;
  private readonly hasNameEmbeddingColumn: boolean;

  constructor(config: SqliteImageStoreConfig) {
    this.databasePath = path.resolve(config.databasePath);
    ensureImageDatabase(this.databasePath);

    this.db = new Database(this.databasePath, { readonly: true, fileMustExist: true });
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'images'").all();
    if (tables.length === 0) {
      this.db.close();
      throw new Error(`SQLite 数据库缺少 images 表：${this.databasePath}`);
    }

    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(images)").all() as Array<{ name: string }>).map((column) => column.name),
    );
    const requiredColumns = ["id", "name", "image_path", "embedding"];
    const missingColumns = requiredColumns.filter((column) => !columns.has(column));
    if (missingColumns.length > 0) {
      this.db.close();
      throw new Error(`SQLite images 表缺少字段：${missingColumns.join(", ")}`);
    }

    this.hasCategoryColumn = columns.has("category");
    this.hasOriginalFilenameColumn = columns.has("original_filename");
    this.hasImageEmbeddingColumn = columns.has("image_embedding");
    this.hasNameEmbeddingColumn = columns.has("name_embedding");
  }

  get count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM images").get() as { count: number };
    return Number(row.count);
  }

  async search(query: string, topK = 8, category?: string): Promise<SqliteImageSearchHit[]> {
    const rows = this.loadRows(category);
    if (rows.length === 0) {
      return [];
    }

    // Electron 主进程中不能同时初始化两个 ONNX 模型，否则可能触发 native 崩溃并直接关闭窗口。
    const queryVector = await embedText(query);
    const keywords = await segmentQuery(query);
    const prepared = rows.map((row): PreparedSearchItem => {
      const imageVector = bufferToVector(row.image_embedding);
      const nameVector = bufferToVector(row.name_embedding);
      const keyword = keywordScore(keywords, row.name);
      return {
        ...row,
        nameScore: cosineSimilarity(queryVector, nameVector),
        imageScore: cosineSimilarity(queryVector, imageVector),
        keywordScore: keyword.score,
        matchedKeywords: keyword.matchedKeywords,
      };
    });

    return prepared
      .map((item): SqliteImageSearchHit => {
        const vectorScore =
          DEFAULT_VECTOR_WEIGHTS.name * item.nameScore +
          (1 - DEFAULT_VECTOR_WEIGHTS.name) * item.imageScore;
        const score =
          DEFAULT_VECTOR_WEIGHTS.vector * vectorScore +
          (1 - DEFAULT_VECTOR_WEIGHTS.vector) * item.keywordScore;
        const filePath = resolveImagePath(item.image_path, this.databasePath);

        return {
          id: String(item.id),
          originalFilename: item.original_filename,
          name: item.name,
          category: item.category,
          imagePath: filePath,
          filePath,
          url: pathToFileURL(filePath).href,
          fileName: path.basename(filePath),
          tags: item.matchedKeywords,
          description: item.name,
          score,
          scores: {
            name: item.nameScore,
            image: item.imageScore,
            vector: vectorScore,
            keyword: item.keywordScore,
          },
          matchedKeywords: item.matchedKeywords,
        };
      })
      .sort((left, right) =>
        right.score - left.score ||
        right.scores.keyword - left.scores.keyword ||
        Number(left.id) - Number(right.id),
      )
      .slice(0, topK);
  }

  close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  private loadRows(category?: string): ImageRow[] {
    const originalFilename = this.hasOriginalFilenameColumn ? "COALESCE(original_filename, name)" : "name";
    const categoryExpression = this.hasCategoryColumn ? "COALESCE(category, 'unknown')" : "'unknown'";
    const imageEmbedding = this.hasImageEmbeddingColumn ? "COALESCE(image_embedding, embedding)" : "embedding";
    const nameEmbedding = this.hasNameEmbeddingColumn ? "name_embedding" : "NULL";
    const where = this.hasCategoryColumn && category ? " WHERE LOWER(category) = LOWER(?)" : "";

    return this.db.prepare(`
      SELECT
        id,
        ${originalFilename} AS original_filename,
        name,
        ${categoryExpression} AS category,
        image_path,
        ${imageEmbedding} AS image_embedding,
        ${nameEmbedding} AS name_embedding
      FROM images${where}
    `).all(...(where ? [category] : [])) as ImageRow[];
  }
}
