import fs from "fs";
import { getAiConfig } from "../ai/config";
import {
  configureTransformersEnv,
  configureTransformersProxy,
  getTransformersCacheDir,
} from "../ai/transformers-config";
import { getImageModelId, getTextModelId } from "../mcp/sqlite-embedding";

const SEGMENTATION_MODEL_ID = "Xenova/bert-base-chinese-ws";

/** 预下载应用检索所需的 CLIP 文本、图片和中文分词模型。 */
async function main(): Promise<void> {
  // 先加载 .env，允许用户通过 IMAGE_MODEL_CACHE_DIR 指定缓存位置。
  getAiConfig();
  const proxy = configureTransformersProxy();
  if (proxy) {
    console.log(`模型下载使用${proxy.source}：${proxy.endpoint}`);
  } else {
    console.log("未检测到 HTTP(S) 代理，将尝试直连 Hugging Face。");
  }

  try {
    const transformers = await import("@huggingface/transformers");
    configureTransformersEnv(transformers.env, true);
    fs.mkdirSync(getTransformersCacheDir(), { recursive: true });

    console.log(`准备下载模型到：${getTransformersCacheDir()}`);
    await transformers.AutoTokenizer.from_pretrained(getTextModelId());
    await transformers.AutoModel.from_pretrained(getTextModelId(), { dtype: "q8" });
    await transformers.AutoProcessor.from_pretrained(getImageModelId());
    await transformers.CLIPVisionModelWithProjection.from_pretrained(getImageModelId(), { dtype: "q8" });
    await transformers.pipeline("token-classification", SEGMENTATION_MODEL_ID, { dtype: "q8" });
    console.log("模型预下载完成。运行时将优先使用本地文件。");
  } finally {
    await proxy?.close();
  }
}

main().catch((error) => {
  console.error("模型预下载失败：", error);
  if (error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
    console.error("连接模型仓库超时。请检查代理是否可用，并确认代理可以访问 huggingface.co。");
  }
  process.exitCode = 1;
});
