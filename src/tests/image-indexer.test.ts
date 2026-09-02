import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";
import { scanImageIndexGroups } from "../ai/image-indexer";

test("索引扫描按目录分组，并保留数据库已有图片的勾选状态", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "imgm-indexer-"));
  const nestedDirectory = path.join(directory, "nested");
  const databasePath = path.join(directory, "index.db");
  fs.mkdirSync(nestedDirectory);
  const rootImage = path.join(directory, "one.png");
  const nestedImage = path.join(nestedDirectory, "two.webp");
  fs.writeFileSync(rootImage, "placeholder");
  fs.writeFileSync(nestedImage, "placeholder");
  fs.writeFileSync(path.join(directory, "skip.txt"), "placeholder");

  try {
    let groups = await scanImageIndexGroups(directory, databasePath);
    assert.equal(groups.length, 2);
    assert.equal(groups.flatMap((group) => group.images).length, 2);
    assert.equal(groups.flatMap((group) => group.images).every((item) => !item.indexed), true);
    assert.match(groups[0].images[0].fileUrl, /^file:/);

    const database = new Database(databasePath);
    database.prepare("INSERT INTO images (original_filename, name, category, image_path, embedding) VALUES (?, ?, ?, ?, ?)")
      .run("one.png", "one", "test", rootImage, Buffer.from([0]));
    database.close();

    groups = await scanImageIndexGroups(directory, databasePath);
    const indexed = groups.flatMap((group) => group.images).find((item) => item.filePath === rootImage);
    assert.equal(indexed?.indexed, true);

    groups = await scanImageIndexGroups(nestedDirectory, databasePath);
    assert.equal(groups.flatMap((group) => group.images).some((item) => item.filePath === rootImage && item.indexed), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
