import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getCategoryTags } from "./category-knowledge";
import { DatasetSplit, ImageAspect, ImageMetadata } from "./types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

const COLOR_PALETTE = [
  { name: "黑色", rgb: [20, 20, 20] },
  { name: "白色", rgb: [240, 240, 240] },
  { name: "灰色", rgb: [128, 128, 128] },
  { name: "红色", rgb: [220, 50, 50] },
  { name: "橙色", rgb: [235, 135, 35] },
  { name: "黄色", rgb: [235, 210, 45] },
  { name: "绿色", rgb: [65, 165, 75] },
  { name: "青色", rgb: [55, 180, 180] },
  { name: "蓝色", rgb: [55, 105, 205] },
  { name: "紫色", rgb: [145, 80, 175] },
  { name: "粉色", rgb: [235, 145, 175] },
  { name: "棕色", rgb: [130, 85, 55] },
] as const;

export type MetadataProgress = {
  completed: number;
  total: number;
  currentPath: string;
};

/** 递归收集受支持的图片文件。 */
export async function listImageFiles(rootPath: string): Promise<string[]> {
  const result: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        result.push(fullPath);
      }
    }
  }

  await visit(rootPath);
  return result.sort((left, right) => left.localeCompare(right, "zh-CN"));
}

/** 根据尺寸判断图片是横图、竖图还是方图。 */
export function getImageAspect(width: number, height: number): ImageAspect {
  if (!width || !height) {
    return "未知";
  }
  const ratio = width / height;
  if (ratio > 1.08) {
    return "横图";
  }
  if (ratio < 0.92) {
    return "竖图";
  }
  return "方图";
}

/** 将 RGB 主色映射为便于自然语言检索的颜色名。 */
export function getNearestColor(red: number, green: number, blue: number): string {
  let bestName: string = COLOR_PALETTE[0].name;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of COLOR_PALETTE) {
    const distance =
      (red - color.rgb[0]) ** 2 * 0.3 +
      (green - color.rgb[1]) ** 2 * 0.59 +
      (blue - color.rgb[2]) ** 2 * 0.11;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = color.name;
    }
  }
  return bestName;
}

/** 将 RGB 数值转换为十六进制颜色。 */
function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** 根据相对路径生成稳定且可作为 SQLite 记录主键的 ID。 */
export function createImageId(relativePath: string): string {
  return crypto.createHash("sha256").update(relativePath.replace(/\\/g, "/").toLowerCase()).digest("hex");
}

/** 根据稳定哈希把图片初步划分到训练集或测试集。 */
export function getInitialSplit(id: string, testRatio = 0.2): DatasetSplit {
  const bucket = Number.parseInt(id.slice(0, 8), 16) / 0xffffffff;
  return bucket < testRatio ? "test" : "train";
}

/** 生成供向量化与大模型阅读的图片描述。 */
export function buildSearchText(metadata: Omit<ImageMetadata, "searchText">): string {
  return [
    `类别:${metadata.category}`,
    `文件:${metadata.fileName}`,
    `子目录:${metadata.subcategories.join("/") || "无"}`,
    `形式:${metadata.animated ? "动图" : "静态图"} ${metadata.transparent ? "透明背景" : "普通背景"}`,
    `构图:${metadata.aspect}`,
    `主色:${metadata.dominantColor}`,
    `标签:${metadata.tags.join(" ")}`,
  ].join("；");
}

/** 提取单张图片的目录语义、尺寸、透明度与主色元数据。 */
export async function extractImageMetadata(rootPath: string, filePath: string): Promise<ImageMetadata> {
  const relativePath = path.relative(rootPath, filePath);
  const pathSegments = relativePath.split(path.sep);
  const category = pathSegments.length > 1 ? pathSegments[0] : "未分类";
  const subcategories = pathSegments.slice(1, -1);
  const fileName = path.basename(filePath);
  const id = createImageId(relativePath);
  const fileStat = await fs.stat(filePath);

  try {
    const image = sharp(filePath, { animated: false, failOn: "none" });
    const [rawMetadata, stats] = await Promise.all([image.metadata(), image.clone().resize(32, 32, { fit: "inside" }).stats()]);
    const width = rawMetadata.width || 0;
    const height = rawMetadata.height || 0;
    const dominant = stats.dominant;
    const dominantColor = getNearestColor(dominant.r, dominant.g, dominant.b);
    const tags = Array.from(
      new Set([
        ...getCategoryTags(category),
        dominantColor,
        getImageAspect(width, height),
        rawMetadata.pages && rawMetadata.pages > 1 ? "动图" : "静态图",
        rawMetadata.hasAlpha ? "透明背景" : "普通背景",
        ...subcategories,
      ])
    );

    const base = {
      id,
      filePath,
      relativePath,
      fileName,
      category,
      subcategories,
      format: rawMetadata.format || path.extname(filePath).slice(1).toLowerCase(),
      width,
      height,
      aspect: getImageAspect(width, height),
      sizeBytes: fileStat.size,
      animated: Boolean(rawMetadata.pages && rawMetadata.pages > 1),
      transparent: Boolean(rawMetadata.hasAlpha),
      dominantColor,
      dominantHex: rgbToHex(dominant.r, dominant.g, dominant.b),
      tags,
      split: getInitialSplit(id),
      status: "ok" as const,
    };

    return { ...base, searchText: buildSearchText({ ...base, error: undefined }) };
  } catch (error) {
    const base = {
      id,
      filePath,
      relativePath,
      fileName,
      category,
      subcategories,
      format: path.extname(filePath).slice(1).toLowerCase(),
      width: 0,
      height: 0,
      aspect: "未知" as const,
      sizeBytes: fileStat.size,
      animated: path.extname(filePath).toLowerCase() === ".gif",
      transparent: false,
      dominantColor: "未知",
      dominantHex: "#000000",
      tags: getCategoryTags(category),
      split: getInitialSplit(id),
      status: "partial" as const,
      error: error instanceof Error ? error.message : String(error),
    };
    return { ...base, searchText: buildSearchText(base) };
  }
}

/** 以固定并发度处理列表，避免一次打开过多图片文件。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/** 扫描目录并批量生成图片元数据。 */
export async function collectImageMetadata(
  rootPath: string,
  concurrency = 8,
  onProgress?: (progress: MetadataProgress) => void
): Promise<ImageMetadata[]> {
  const files = await listImageFiles(rootPath);
  let completed = 0;
  return mapWithConcurrency(files, concurrency, async (filePath) => {
    const metadata = await extractImageMetadata(rootPath, filePath);
    completed += 1;
    onProgress?.({ completed, total: files.length, currentPath: filePath });
    return metadata;
  });
}
