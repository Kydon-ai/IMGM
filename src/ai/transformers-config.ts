import path from "path";

/** 获取项目内 Transformers.js 模型缓存目录。 */
export function getTransformersCacheDir(): string {
  return path.resolve(process.env.IMAGE_MODEL_CACHE_DIR || path.join(process.cwd(), "data", "models"));
}

/** 配置 Transformers.js 使用指定的本地缓存，并控制是否允许联网补齐模型。 */
export function configureTransformersEnv(transformersEnv: any, allowRemoteModels: boolean): void {
  transformersEnv.cacheDir = getTransformersCacheDir();
  transformersEnv.allowLocalModels = true;
  transformersEnv.allowRemoteModels = allowRemoteModels;
}
