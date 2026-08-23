import path from "path";
import { getAiConfig } from "../ai/config";
import { loadDataset, summarizeDataset } from "../ai/dataset";
import { MilvusImageStore } from "../ai/milvus-image-store";
import { evaluateRetrieval, saveEvaluation } from "../ai/retrieval-evaluation";

/** 运行 Milvus Precision@8 评测并落盘报告。 */
async function main(): Promise<void> {
  const config = getAiConfig();
  const items = await loadDataset(config.datasetPath);
  const store = new MilvusImageStore({ address: config.milvusAddress, collectionName: config.milvusCollection });
  try {
    const result = await evaluateRetrieval(store, items);
    const datasetSummary = summarizeDataset(path.dirname(config.datasetPath), items);
    const outputPath = path.resolve("artifacts", "evaluation");
    await saveEvaluation(outputPath, result, datasetSummary);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) {
      process.exitCode = 1;
    }
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error("检索评测失败:", error);
  process.exitCode = 1;
});
