import fs from "fs/promises";
import path from "path";
import { DatasetSummary, ImageMetadata } from "./types";

/** 按类别分层修正训练/测试集，避免大类别没有测试样本。 */
export function stratifyDataset(items: ImageMetadata[], testRatio = 0.2): ImageMetadata[] {
  const groups = new Map<string, ImageMetadata[]>();
  for (const item of items) {
    const group = groups.get(item.category) || [];
    group.push(item);
    groups.set(item.category, group);
  }

  for (const group of groups.values()) {
    group.sort((left, right) => left.id.localeCompare(right.id));
    const testCount = group.length <= 1 ? 0 : Math.max(1, Math.round(group.length * testRatio));
    const testIds = new Set(group.slice(0, testCount).map((item) => item.id));
    for (const item of group) {
      item.split = testIds.has(item.id) ? "test" : "train";
    }
  }

  return items;
}

/** 汇总数据集规模、异常数和每类切分数量。 */
export function summarizeDataset(rootPath: string, items: ImageMetadata[]): DatasetSummary {
  const categories: DatasetSummary["categories"] = {};
  for (const item of items) {
    const current = categories[item.category] || { total: 0, train: 0, test: 0 };
    current.total += 1;
    current[item.split] += 1;
    categories[item.category] = current;
  }

  return {
    rootPath,
    generatedAt: new Date().toISOString(),
    total: items.length,
    train: items.filter((item) => item.split === "train").length,
    test: items.filter((item) => item.split === "test").length,
    partial: items.filter((item) => item.status === "partial").length,
    categories,
  };
}

/** 把完整、训练和测试数据写为 JSONL，并生成摘要文件。 */
export async function saveDataset(rootPath: string, outputPath: string, sourceItems: ImageMetadata[]): Promise<DatasetSummary> {
  const items = stratifyDataset(sourceItems);
  const summary = summarizeDataset(rootPath, items);
  await fs.mkdir(outputPath, { recursive: true });

  const writeJsonLines = async (fileName: string, rows: ImageMetadata[]): Promise<void> => {
    const contents = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    await fs.writeFile(path.join(outputPath, fileName), contents, "utf8");
  };

  await Promise.all([
    writeJsonLines("images.jsonl", items),
    writeJsonLines("train.jsonl", items.filter((item) => item.split === "train")),
    writeJsonLines("test.jsonl", items.filter((item) => item.split === "test")),
    fs.writeFile(path.join(outputPath, "summary.json"), JSON.stringify(summary, null, 2), "utf8"),
  ]);

  return summary;
}

/** 从 JSONL 清单读取图片元数据。 */
export async function loadDataset(filePath: string): Promise<ImageMetadata[]> {
  const contents = await fs.readFile(filePath, "utf8");
  return contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ImageMetadata);
}
