import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import Database from "better-sqlite3";
import { embedImage, embedTexts } from "../mcp/sqlite-embedding";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

export type ImageIndexItem = {
  filePath: string;
  fileName: string;
  fileUrl: string;
  indexed: boolean;
};

export type ImageIndexGroup = {
  directoryPath: string;
  images: ImageIndexItem[];
};

export type ImageIndexProgress = {
  phase: "starting" | "processing" | "completed" | "error";
  currentPath?: string;
  completed: number;
  total: number;
  added: number;
  removed: number;
  unchanged: number;
  message?: string;
};

type IndexedRow = { id: number; image_path: string };

function pathKey(filePath: string): string {
  const normalized = path.resolve(filePath).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveStoredPath(imagePath: string, databasePath: string): string {
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

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function deriveNameFromFilename(filename: string): string {
  const basename = path.parse(filename).name;
  return basename.split("_").at(-1)?.trim() || basename;
}

function categoryForPath(rootPath: string, imagePath: string): string {
  const relative = path.relative(rootPath, imagePath);
  const firstPart = relative.split(path.sep)[0];
  return firstPart && firstPart !== path.basename(imagePath) ? firstPart : path.basename(rootPath) || "未分类";
}

function ensureIndexSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY,
      original_filename TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'unknown',
      image_path TEXT NOT NULL,
      embedding BLOB NOT NULL,
      image_embedding BLOB,
      name_embedding BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_images_path ON images(image_path);
    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
  `);

  const columns = new Set(
    (database.prepare("PRAGMA table_info(images)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  const additions: Record<string, string> = {
    original_filename: "ALTER TABLE images ADD COLUMN original_filename TEXT NOT NULL DEFAULT ''",
    category: "ALTER TABLE images ADD COLUMN category TEXT NOT NULL DEFAULT 'unknown'",
    image_embedding: "ALTER TABLE images ADD COLUMN image_embedding BLOB",
    name_embedding: "ALTER TABLE images ADD COLUMN name_embedding BLOB",
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

async function collectGroups(rootPath: string): Promise<Map<string, string[]>> {
  const groups = new Map<string, string[]>();
  const visit = async (directoryPath: string): Promise<void> => {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const images = groups.get(directoryPath) || [];
        images.push(entryPath);
        groups.set(directoryPath, images);
      }
    }
  };
  await visit(rootPath);
  return groups;
}

function readIndexedRows(database: Database.Database): IndexedRow[] {
  return database.prepare("SELECT id, image_path FROM images").all() as IndexedRow[];
}

export async function scanImageIndexGroups(rootPath: string, databasePath: string): Promise<ImageIndexGroup[]> {
  const resolvedRoot = path.resolve(rootPath);
  const stats = await fs.promises.stat(resolvedRoot).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`图片目录不存在或不可访问：${resolvedRoot}`);
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    ensureIndexSchema(database);
    const indexedPaths = new Set(readIndexedRows(database).map((row) => pathKey(resolveStoredPath(row.image_path, databasePath))));
    const groups = await collectGroups(resolvedRoot);
    return [...groups.entries()].map(([directoryPath, images]) => ({
      directoryPath,
      images: images.map((filePath) => ({
        filePath,
        fileName: path.basename(filePath),
        fileUrl: pathToFileURL(filePath).toString(),
        indexed: indexedPaths.has(pathKey(filePath)),
      })),
    }));
  } finally {
    database.close();
  }
}

export async function applyImageIndexSelection(options: {
  rootPath: string;
  databasePath: string;
  selectedPaths: string[];
  onProgress: (progress: ImageIndexProgress) => void;
}): Promise<{ added: number; removed: number; unchanged: number }> {
  const rootPath = path.resolve(options.rootPath);
  const groups = await collectGroups(rootPath);
  const scannedPaths = [...groups.values()].flat();
  const scannedByKey = new Map(scannedPaths.map((filePath) => [pathKey(filePath), filePath]));
  const selectedKeys = new Set(options.selectedPaths.map(pathKey));
  for (const key of selectedKeys) {
    if (!scannedByKey.has(key)) {
      throw new Error("提交的图片不属于当前扫描目录，请重新打开索引列表后再试");
    }
  }

  fs.mkdirSync(path.dirname(options.databasePath), { recursive: true });
  const database = new Database(options.databasePath);
  try {
    ensureIndexSchema(database);
    const rows = readIndexedRows(database);
    const existingByKey = new Map(rows.map((row) => [pathKey(resolveStoredPath(row.image_path, options.databasePath)), row]));
    const scopedKeys = new Set(scannedByKey.keys());
    const removals = rows.filter((row) => {
      const key = pathKey(resolveStoredPath(row.image_path, options.databasePath));
      return scopedKeys.has(key) && !selectedKeys.has(key);
    });
    const additions = [...selectedKeys]
      .filter((key) => !existingByKey.has(key))
      .map((key) => scannedByKey.get(key) as string);
    const unchanged = [...selectedKeys].filter((key) => existingByKey.has(key)).length;
    const total = removals.length + additions.length;
    let completed = 0;
    let removed = 0;
    let added = 0;
    options.onProgress({ phase: "starting", completed, total, added, removed, unchanged, message: "正在计算索引差异" });

    const deleteById = database.prepare("DELETE FROM images WHERE id = ?");
    for (const row of removals) {
      deleteById.run(row.id);
      removed += 1;
      completed += 1;
      options.onProgress({ phase: "processing", currentPath: row.image_path, completed, total, added, removed, unchanged, message: "正在移除图片索引" });
    }

    const names = additions.map((filePath) => deriveNameFromFilename(path.basename(filePath)));
    const nameVectors: number[][] = [];
    for (let offset = 0; offset < names.length; offset += 32) {
      nameVectors.push(...await embedTexts(names.slice(offset, offset + 32)));
    }
    const insert = database.prepare(`
      INSERT INTO images (original_filename, name, category, image_path, embedding, image_embedding, name_embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [index, filePath] of additions.entries()) {
      options.onProgress({ phase: "processing", currentPath: filePath, completed, total, added, removed, unchanged, message: "正在生成图片向量" });
      const imageVector = await embedImage(filePath);
      const imageBuffer = vectorToBuffer(imageVector);
      const nameBuffer = vectorToBuffer(nameVectors[index] || []);
      insert.run(path.basename(filePath), names[index] || path.basename(filePath), categoryForPath(rootPath, filePath), filePath, imageBuffer, imageBuffer, nameBuffer);
      added += 1;
      completed += 1;
      options.onProgress({ phase: "processing", currentPath: filePath, completed, total, added, removed, unchanged, message: "正在写入图片索引" });
    }

    options.onProgress({ phase: "completed", completed, total, added, removed, unchanged, message: "图片索引已完成" });
    return { added, removed, unchanged };
  } finally {
    database.close();
  }
}
