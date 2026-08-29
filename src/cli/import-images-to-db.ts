import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { collectImageMetadata } from "../ai/metadata";
import { MetadataEmbeddings } from "../ai/hash-embeddings";
import { getAiConfig } from "../ai/config";

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
      name_embedding BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_images_path ON images(image_path);
    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
  `);
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
    const embeddings = new MetadataEmbeddings();
    const vectors = await embeddings.embedDocuments(metadata.map((item) => item.searchText));
    const findExisting = database.prepare("SELECT id FROM images WHERE image_path = ? LIMIT 1");
    const insert = database.prepare(`
      INSERT INTO images (original_filename, name, category, image_path, embedding)
      VALUES (?, ?, ?, ?, ?)
    `);
    const update = database.prepare(`
      UPDATE images
      SET original_filename = ?, name = ?, category = ?, embedding = ?
      WHERE id = ?
    `);
    const write = database.transaction(() => {
      let inserted = 0;
      let updated = 0;

      metadata.forEach((item, index) => {
        const searchableName = [item.fileName, item.category, ...item.subcategories, ...item.tags].join(" ");
        const vector = vectorToBuffer(vectors[index] || []);
        const existing = findExisting.get(item.filePath) as { id: number } | undefined;
        if (existing) {
          update.run(item.fileName, searchableName, item.category, vector, existing.id);
          updated += 1;
        } else {
          insert.run(item.fileName, searchableName, item.category, item.filePath, vector);
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
