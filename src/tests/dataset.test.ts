import assert from "node:assert/strict";
import test from "node:test";
import { stratifyDataset, summarizeDataset } from "../ai/dataset";
import { ImageMetadata } from "../ai/types";

/** 创建用于测试分层切分的最小图片元数据。 */
function createItem(category: string, index: number): ImageMetadata {
  return {
    id: `${category}-${String(index).padStart(2, "0")}`,
    filePath: `${category}/${index}.png`,
    relativePath: `${category}/${index}.png`,
    fileName: `${index}.png`,
    category,
    subcategories: [],
    format: "png",
    width: 100,
    height: 100,
    aspect: "方图",
    sizeBytes: 100,
    animated: false,
    transparent: true,
    dominantColor: "蓝色",
    dominantHex: "#0000ff",
    tags: [category],
    searchText: category,
    split: "train",
    status: "ok",
  };
}

test("分层切分应为每个非单例类别保留测试数据", () => {
  const items = [
    ...Array.from({ length: 10 }, (_, index) => createItem("甲", index)),
    ...Array.from({ length: 5 }, (_, index) => createItem("乙", index)),
    createItem("单例", 0),
  ];

  const result = stratifyDataset(items, 0.2);
  const summary = summarizeDataset("/images", result);

  assert.deepEqual(summary.categories["甲"], { total: 10, train: 8, test: 2 });
  assert.deepEqual(summary.categories["乙"], { total: 5, train: 4, test: 1 });
  assert.deepEqual(summary.categories["单例"], { total: 1, train: 1, test: 0 });
});
