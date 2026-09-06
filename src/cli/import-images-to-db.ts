import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { collectImageMetadata } from "../ai/metadata";
import { getAiConfig } from "../ai/config";
import { embedImage, embedTexts } from "../mcp/sqlite-embedding";
import { buildSearchableText, deriveDisplayName } from "../ai/searchable-text";

type ImportOptions = {
  rootPath: string;
  databasePath: string;
};

function parseArguments(): ImportOptions {
  const rootPath = path.resolve(process.argv[2] || "D:\\pic");
  const databasePath = path.resolve(process.argv[3] || getAiConfig().imageDbPath);
  return { rootPath, databasePath };
}

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY,
      original_filename TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_path TEXT NOT NULL,
      embedding BLOB NOT NULL,
      image_embedding BLOB,
      name_embedding BLOB,
      searchable_text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_images_path ON images(image_path);
    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
  `);

  const columns = new Set(
    (database.prepare("PRAGMA table_info(images)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!columns.has("searchable_text")) {
    database.exec("ALTER TABLE images ADD COLUMN searchable_text TEXT NOT NULL DEFAULT ''");
  }
}

async function main(): Promise<void> {
  const { rootPath, databasePath } = parseArguments();
  if (!fs.existsSync(rootPath)) {
    throw new Error(`图片目录不存在：${rootPath}`);
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const metadata = await collectImageMetadata(rootPath, 8, ({ completed, total, currentPath }) => {
    if (completed === total || completed % 100 === 0) {
      console.log(`[${completed}/${total}] ${currentPath}`);
    }
  });

  const database = new Database(databasePath);
  try {
    createSchema(database);
    const names = metadata.map((item) => deriveDisplayName(item.fileName));
    const searchableTexts = metadata.map((item) => buildSearchableText({
      fileName: item.fileName,
      category: item.category,
    }));
    console.log(`正在生成 ${metadata.length} 条名称向量...`);
    const nameVectors = await embedTexts(searchableTexts);
    const imageVectors: number[][] = [];

    // Vision inference is intentionally sequential. It avoids starting several
    // ONNX sessions at once on the Electron/Windows native runtime.
    for (const [index, item] of metadata.entries()) {
      console.log(`[${index + 1}/${metadata.length}] 正在生成图片向量：${item.fileName}`);
      try {
        imageVectors.push(await embedImage(item.filePath));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`图片向量生成失败：${item.filePath}\n${message}`);
      }
    }

    const findExisting = database.prepare("SELECT id FROM images WHERE image_path = ? LIMIT 1");
    const insert = database.prepare(`
      INSERT INTO images (
        original_filename,
        name,
        category,
        image_path,
        embedding,
        image_embedding,
        name_embedding,
        searchable_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const update = database.prepare(`
      UPDATE images
      SET original_filename = ?, name = ?, category = ?, embedding = ?, image_embedding = ?, name_embedding = ?, searchable_text = ?
      WHERE id = ?
    `);
    const write = database.transaction(() => {
      let inserted = 0;
      let updated = 0;

      metadata.forEach((item, index) => {
        const name = names[index] || item.fileName;
        const searchableText = searchableTexts[index] || name;
        const imageVector = vectorToBuffer(imageVectors[index] || []);
        const nameVector = vectorToBuffer(nameVectors[index] || []);
        const existing = findExisting.get(item.filePath) as { id: number } | undefined;
        if (existing) {
          update.run(item.fileName, name, item.category, imageVector, imageVector, nameVector, searchableText, existing.id);
          updated += 1;
        } else {
          insert.run(item.fileName, name, item.category, item.filePath, imageVector, imageVector, nameVector, searchableText);
          inserted += 1;
        }
      });

      return { inserted, updated };
    });

    const result = write();
    const count = (database.prepare("SELECT COUNT(*) AS count FROM images").get() as { count: number }).count;
    console.log(`图片导入完成：新增 ${result.inserted}，更新 ${result.updated}，数据库共 ${count} 条记录`);
    console.log(`数据库路径：${databasePath}`);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error("导入图片到 SQLite 失败：", error);
  process.exitCode = 1;
});
