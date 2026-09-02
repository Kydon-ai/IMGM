import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { SqliteImageStore } from "../mcp/sqlite-image-store";

test("MCP 应读取参考项目的 SQLite images 表", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "imgm-mcp-"));
  const databasePath = path.join(tempDirectory, "app.db");
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE images (
      id INTEGER PRIMARY KEY,
      original_filename TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_path TEXT NOT NULL,
      embedding BLOB NOT NULL,
      image_embedding BLOB,
      name_embedding BLOB
    );
    INSERT INTO images (id, original_filename, name, category, image_path, embedding)
    VALUES (1, 'capoo.gif', 'capoo 开心', 'capoo', 'data/images/capoo.gif', zeroblob(2048));
  `);
  database.close();

  const store = new SqliteImageStore({ databasePath });
  assert.equal(store.count, 1);
  store.close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("SQLite 数据库不存在时应自动初始化空 images 表", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "imgm-mcp-init-"));
  const databasePath = path.join(tempDirectory, "nested", "app.db");

  const store = new SqliteImageStore({ databasePath });
  assert.equal(fs.existsSync(databasePath), true);
  assert.equal(store.count, 0);
  store.close();

  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'images'")
    .get() as { name: string } | undefined;
  assert.equal(table?.name, "images");
  database.close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});
