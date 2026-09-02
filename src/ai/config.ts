import path from "path";
import dotenv from "dotenv";
import fs from "fs";

export type AiConfig = {
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekBaseUrl: string;
  datasetPath: string;
  imageDbPath: string;
  textModelId: string;
  imageModelId: string;
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

/** 读取 AI、SQLite 与数据集运行配置。 */
export function getAiConfig(): AiConfig {
  loadEnvironment();
  return {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
    deepseekModel: process.env.DEEPSEEK_MODEL_NAME || "deepseek-chat",
    deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    datasetPath: path.resolve(process.env.IMAGE_DATASET_PATH || path.join("data", "dataset", "images.jsonl")),
    imageDbPath: path.resolve(process.env.IMAGE_DB_PATH || path.join("data", "app.db")),
    textModelId: process.env.TEXT_MODEL_ID || "aurantium/clip-ViT-B-32-multilingual-v1",
    imageModelId: process.env.IMAGE_MODEL_ID || "Xenova/clip-vit-base-patch32",
  };
}

/** 检查 DeepSeek 聊天所需的密钥是否已经配置。 */
export function assertDeepSeekConfigured(config = getAiConfig()): void {
  if (!config.deepseekApiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，请在 .env 中配置");
  }
}
