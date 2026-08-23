import path from "path";
import { collectImageMetadata } from "../ai/metadata";
import { saveDataset } from "../ai/dataset";

/** 解析命令行参数，不传入时使用任务指定的默认图片目录。 */
function parseArguments(): { rootPath: string; outputPath: string } {
  const rootPath = process.argv[2] || "C:\\Users\\lqd\\Pictures\\人物头像";
  const outputPath = process.argv[3] || path.join(process.cwd(), "data", "dataset");
  return { rootPath: path.resolve(rootPath), outputPath: path.resolve(outputPath) };
}

/** 执行元数据提取和分层数据集生成。 */
async function main(): Promise<void> {
  const { rootPath, outputPath } = parseArguments();
  console.log(`开始扫描图片目录: ${rootPath}`);
  const metadata = await collectImageMetadata(rootPath, 8, ({ completed, total, currentPath }) => {
    if (completed === total || completed % 100 === 0) {
      console.log(`[${completed}/${total}] ${currentPath}`);
    }
  });
  const summary = await saveDataset(rootPath, outputPath, metadata);
  console.log(`数据集已生成: ${outputPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("生成数据集失败:", error);
  process.exitCode = 1;
});
