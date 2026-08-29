import fs from "fs/promises";
import path from "path";
import { CATEGORY_KNOWLEDGE, detectCategory, getCategoryFamily } from "./category-knowledge";
import { SqliteImageStore } from "./sqlite-image-store";
import { DatasetSummary, ImageMetadata, SearchIntent } from "./types";

export type CategoryEvaluation = {
  category: string;
  queries: number;
  relevant: number;
  returned: number;
  precisionAt8: number;
};

export type RetrievalEvaluation = {
  generatedAt: string;
  k: 8;
  queryCount: number;
  precisionAt8: number;
  passed: boolean;
  target: number;
  categories: CategoryEvaluation[];
  excludedCategories: string[];
};

/** 为一个类别生成多种自然语言评测查询。 */
function buildCategoryQueries(category: string, samples: ImageMetadata[]): string[] {
  const knowledge = CATEGORY_KNOWLEDGE[category];
  const name = knowledge?.aliases[0] || category;
  const colors = Array.from(new Set(samples.map((item) => item.dominantColor))).slice(0, 2);
  return Array.from(
    new Set([
      `帮我找一些${name}相关的图片`,
      `我想要${name}表情包`,
      `检索可爱的${name}素材`,
      ...colors.map((color) => `找几张${color}的${name}图片`),
    ])
  );
}

/** 判断命中类别是否属于查询类别的相关系列。 */
function isRelevant(expectedCategory: string, actualCategory: string): boolean {
  return getCategoryFamily(expectedCategory).includes(actualCategory);
}

/** 在 SQLite 图片索引上评估测试集类别查询的 Precision@8。 */
export async function evaluateRetrieval(
  store: SqliteImageStore,
  items: ImageMetadata[],
  target = 0.95
): Promise<RetrievalEvaluation> {
  const trainCounts = new Map<string, number>();
  const testGroups = new Map<string, ImageMetadata[]>();
  for (const item of items) {
    if (item.split === "train") {
      trainCounts.set(item.category, (trainCounts.get(item.category) || 0) + 1);
    } else {
      const group = testGroups.get(item.category) || [];
      group.push(item);
      testGroups.set(item.category, group);
    }
  }

  const categories: CategoryEvaluation[] = [];
  const excludedCategories: string[] = [];
  for (const [category, samples] of testGroups) {
    const familyTrainCount = getCategoryFamily(category).reduce((sum, item) => sum + (trainCounts.get(item) || 0), 0);
    if (familyTrainCount < 8) {
      excludedCategories.push(category);
      continue;
    }

    const queries = buildCategoryQueries(category, samples);
    let relevant = 0;
    let returned = 0;
    for (const query of queries) {
      const intent: SearchIntent = { shouldSearch: true, query, category: detectCategory(query) || category };
      const hits = await store.search(intent.query, 8);
      relevant += hits.filter((hit) => isRelevant(category, hit.category)).length;
      returned += hits.length;
    }
    categories.push({
      category,
      queries: queries.length,
      relevant,
      returned,
      precisionAt8: returned ? relevant / returned : 0,
    });
  }

  const relevant = categories.reduce((sum, item) => sum + item.relevant, 0);
  const returned = categories.reduce((sum, item) => sum + item.returned, 0);
  const precisionAt8 = returned ? relevant / returned : 0;
  return {
    generatedAt: new Date().toISOString(),
    k: 8,
    queryCount: categories.reduce((sum, item) => sum + item.queries, 0),
    precisionAt8,
    passed: precisionAt8 > target,
    target,
    categories,
    excludedCategories,
  };
}

/** 写入机器可读 JSON 与便于审阅的 Markdown 评测报告。 */
export async function saveEvaluation(outputDirectory: string, result: RetrievalEvaluation, dataset: DatasetSummary): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true });
  const markdown = [
    "# 图片检索评测报告",
    "",
    `- 数据集：${dataset.total}（训练 ${dataset.train} / 测试 ${dataset.test}）`,
    `- 查询数：${result.queryCount}`,
    `- Precision@8：${(result.precisionAt8 * 100).toFixed(2)}%`,
    `- 目标：>${(result.target * 100).toFixed(0)}%`,
    `- 结论：${result.passed ? "通过" : "未通过"}`,
    "",
    "| 类别 | 查询数 | 命中/返回 | Precision@8 |",
    "| --- | ---: | ---: | ---: |",
    ...result.categories.map(
      (item) => `| ${item.category} | ${item.queries} | ${item.relevant}/${item.returned} | ${(item.precisionAt8 * 100).toFixed(2)}% |`
    ),
    "",
    `训练样本不足 8 张而未计入 Precision@8 的类别：${result.excludedCategories.join("、") || "无"}。`,
    "",
  ].join("\n");
  await Promise.all([
    fs.writeFile(path.join(outputDirectory, "retrieval-evaluation.json"), JSON.stringify(result, null, 2), "utf8"),
    fs.writeFile(path.join(outputDirectory, "retrieval-evaluation.md"), markdown, "utf8"),
  ]);
}
