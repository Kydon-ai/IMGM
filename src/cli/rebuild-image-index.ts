import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { getAiConfig } from "../ai/config";
import { embedImage, embedTexts } from "../mcp/sqlite-embedding";
import { buildSearchableText, deriveDisplayName } from "../ai/searchable-text";

type ImageRow = {
  id: number;
  original_filename: string;
  name: string;
  image_path: string;
  category?: string;
};

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
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

function ensureIndexColumns(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY,
      original_filename TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'unknown',
      image_path TEXT NOT NULL,
      embedding BLOB NOT NULL,
      image_embedding BLOB,
      name_embedding BLOB,
      searchable_text TEXT NOT NULL DEFAULT ''
    );
  `);

  const columns = new Set(
    (database.prepare("PRAGMA table_info(images)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  const additions: Record<string, string> = {
    original_filename: "ALTER TABLE images ADD COLUMN original_filename TEXT NOT NULL DEFAULT ''",
    category: "ALTER TABLE images ADD COLUMN category TEXT NOT NULL DEFAULT 'unknown'",
    image_embedding: "ALTER TABLE images ADD COLUMN image_embedding BLOB",
    name_embedding: "ALTER TABLE images ADD COLUMN name_embedding BLOB",
    searchable_text: "ALTER TABLE images ADD COLUMN searchable_text TEXT NOT NULL DEFAULT ''",
  };

  for (const [column, statement] of Object.entries(additions)) {
    if (!columns.has(column)) {
      database.exec(statement);
    }
  }

  if (!columns.has("name") || !columns.has("image_path") || !columns.has("embedding")) {
    throw new Error("SQLite images 表缺少 name、image_path 或 embedding 字段");
  }
}

async function main(): Promise<void> {
  const config = getAiConfig();
  const databasePath = path.resolve(process.argv[2] || config.imageDbPath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  try {
    ensureIndexColumns(database);
    const rows = database.prepare(`
      SELECT id, COALESCE(original_filename, name) AS original_filename, name, image_path, category
      FROM images
      ORDER BY id
    `).all() as ImageRow[];

    if (rows.length === 0) {
      console.log("SQLite 图片索引为空，无需重建");
      return;
    }

    const names = rows.map((row) => deriveDisplayName(row.original_filename || row.name));
    const searchableTexts = rows.map((row) => buildSearchableText({
      fileName: row.original_filename || row.name,
      category: row.category,
    }));
    const nameVectors: number[][] = [];
    const batchSize = 32;
    console.log(`正在生成 ${rows.length} 条名称向量...`);
    for (let offset = 0; offset < names.length; offset += batchSize) {
      nameVectors.push(...await embedTexts(searchableTexts.slice(offset, offset + batchSize)));
    }

    const update = database.prepare(`
      UPDATE images
      SET name = ?, embedding = ?, image_embedding = ?, name_embedding = ?, searchable_text = ?
      WHERE id = ?
    `);

    let indexed = 0;
    const missing: string[] = [];
    for (const [index, row] of rows.entries()) {
      const imagePath = resolveImagePath(row.image_path, databasePath);
      if (!fs.existsSync(imagePath)) {
        missing.push(row.image_path);
        console.warn(`跳过不存在的图片：${imagePath}`);
        continue;
      }

      console.log(`[${index + 1}/${rows.length}] 正在生成图片向量：${imagePath}`);
      const imageVector = await embedImage(imagePath);
      const imageBuffer = vectorToBuffer(imageVector);
      const nameBuffer = vectorToBuffer(nameVectors[index] || []);
      update.run(
        names[index] || row.name,
        imageBuffer,
        imageBuffer,
        nameBuffer,
        searchableTexts[index] || names[index] || row.name,
        row.id,
      );
      indexed += 1;
    }

    console.log(`图片索引重建完成：${indexed}/${rows.length}`);
    if (missing.length > 0) {
      console.warn(`仍有 ${missing.length} 条记录未生成图片向量，请检查路径后重新运行：images:reindex`);
    }
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error("重建图片向量索引失败：", error);
  process.exitCode = 1;
});
