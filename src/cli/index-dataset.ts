import { getAiConfig } from "../ai/config";
import { loadDataset } from "../ai/dataset";
import { MilvusImageStore } from "../ai/milvus-image-store";

/** 重建集合并把全量图片数据写入 Milvus。 */
async function main(): Promise<void> {
  const config = getAiConfig();
  const items = await loadDataset(config.datasetPath);
  const store = new MilvusImageStore({ address: config.milvusAddress, collectionName: config.milvusCollection });
  try {
    if (!(await store.isHealthy())) {
      throw new Error(`Milvus 未就绪: ${config.milvusAddress}`);
    }
    console.log(`准备写入 ${items.length} 张图片到 ${config.milvusCollection}`);
    await store.recreateCollection();
    const inserted = await store.addImages(items, 200, (count) => console.log(`[${count}/${items.length}] 已写入`));
    console.log(`Milvus 索引完成，共写入 ${inserted} 条`);
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error("建立 Milvus 索引失败:", error);
  process.exitCode = 1;
});
