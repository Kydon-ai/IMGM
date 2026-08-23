import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, MetadataEmbeddings } from "../ai/hash-embeddings";

test("类别别名应比无关类别更相似", async () => {
  const embeddings = new MetadataEmbeddings();
  const query = await embeddings.embedQuery("给我找几张可爱的咖波表情包");
  const capoo = await embeddings.embedQuery("类别:capoos；标签:猫猫虫咖波 卡通 猫 可爱 表情包");
  const basketball = await embeddings.embedQuery("类别:科比；标签:篮球 球星 湖人 人物头像");

  assert.ok(cosineSimilarity(query, capoo) > cosineSimilarity(query, basketball));
});

test("向量维度固定且已归一化", async () => {
  const embeddings = new MetadataEmbeddings(128);
  const vector = await embeddings.embedQuery("透明背景的蓝色卡通猫");
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  assert.equal(vector.length, 128);
  assert.ok(Math.abs(norm - 1) < 1e-10);
});
