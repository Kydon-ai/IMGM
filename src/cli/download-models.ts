import fs from "fs";
import { getAiConfig } from "../ai/config";
import { configureTransformersEnv, getTransformersCacheDir } from "../ai/transformers-config";

const TEXT_MODEL_ID = "aurantium/clip-ViT-B-32-multilingual-v1";
const SEGMENTATION_MODEL_ID = "Xenova/bert-base-chinese-ws";

/** 预下载应用检索所需的文本向量和中文分词模型。 */
async function main(): Promise<void> {
  // 先加载 .env，允许用户通过 IMAGE_MODEL_CACHE_DIR 指定缓存位置。
  getAiConfig();
  const transformers = await import("@huggingface/transformers");
  configureTransformersEnv(transformers.env, true);
  fs.mkdirSync(getTransformersCacheDir(), { recursive: true });

  console.log(`准备下载模型到：${getTransformersCacheDir()}`);
  await transformers.AutoTokenizer.from_pretrained(TEXT_MODEL_ID);
  await transformers.AutoModel.from_pretrained(TEXT_MODEL_ID, { dtype: "q8" });
  await transformers.pipeline("token-classification", SEGMENTATION_MODEL_ID, { dtype: "q8" });
  console.log("模型预下载完成。运行时将优先使用本地文件。");
}

main().catch((error) => {
  console.error("模型预下载失败：", error);
  process.exitCode = 1;
});
