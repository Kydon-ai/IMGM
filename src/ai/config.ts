import path from "path";
import dotenv from "dotenv";
import fs from "fs";

export type AiConfig = {
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekBaseUrl: string;
  milvusAddress: string;
  milvusCollection: string;
  datasetPath: string;
};

let envLoaded = false;

/** 仅加载一次项目根目录下的环境变量。 */
function loadEnvironment(): void {
  if (!envLoaded) {
    const candidates = [path.resolve(process.cwd(), ".env"), path.join(path.dirname(process.execPath), ".env")];
    const envPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (envPath) {
      dotenv.config({ path: envPath, quiet: true });
    }
    envLoaded = true;
  }
}

/** 读取 AI、Milvus 与数据集运行配置。 */
export function getAiConfig(): AiConfig {
  loadEnvironment();
  return {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
    deepseekModel: process.env.DEEPSEEK_MODEL_NAME || "deepseek-chat",
    deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    milvusAddress: process.env.MILVUS_ADDRESS || "localhost:19530",
    milvusCollection: process.env.MILVUS_COLLECTION || "imgm_images_v1",
    datasetPath: path.resolve(process.env.IMAGE_DATASET_PATH || path.join("data", "dataset", "images.jsonl")),
  };
}

/** 检查 DeepSeek 聊天所需的密钥是否已经配置。 */
export function assertDeepSeekConfigured(config = getAiConfig()): void {
  if (!config.deepseekApiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，请在 .env 中配置");
  }
}
