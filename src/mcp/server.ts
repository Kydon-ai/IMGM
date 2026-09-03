import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAiConfig } from "../ai/config";
import { SqliteImageSearchHit, SqliteImageStore } from "./sqlite-image-store";

const SearchImagesInput = {
  query: z.string().trim().min(1).max(500).describe("自然语言图片检索词，例如：可爱的咖波表情包"),
  limit: z.number().int().min(1).max(50).default(8).describe("最多返回的结果数量，范围 1-50"),
  category: z.string().trim().min(1).max(100).optional().describe("按图片类别过滤，可选"),
};

type SearchImagesArgs = {
  query: string;
  limit?: number;
  category?: string;
};

type SearchImagesPayload = {
  query: string;
  mode: "hybrid";
  count: number;
  results: SqliteImageSearchHit[];
};

let storePromise: Promise<SqliteImageStore> | null = null;

/** 创建只读 SQLite 检索客户端，并复用同一 MCP 进程内的连接。 */
async function getStore(): Promise<SqliteImageStore> {
  if (!storePromise) {
    storePromise = Promise.resolve().then(() => {
      const config = getAiConfig();
      return new SqliteImageStore({ databasePath: config.imageDbPath });
    }).catch((error) => {
      storePromise = null;
      throw error;
    });
  }

  return storePromise;
}

function serializeHit(hit: SqliteImageSearchHit): SqliteImageSearchHit {
  return {
    ...hit,
    score: Number(hit.score.toFixed(6)),
    scores: {
      name: Number(hit.scores.name.toFixed(6)),
      image: Number(hit.scores.image.toFixed(6)),
      vector: Number(hit.scores.vector.toFixed(6)),
      keyword: Number(hit.scores.keyword.toFixed(6)),
    },
  };
}

function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "imgm-image-search",
      version: "2.0.0",
    },
    {
      instructions: "使用 search_images 检索 IMGM SQLite 图片索引。结果中的 filePath 是本机文件路径，url 是对应的 file:// 地址。",
    },
  );

  server.registerTool(
    "search_images",
    {
      title: "检索图片",
      description: "使用 IMGM 的 SQLite 图片索引进行混合检索：结合 CLIP 文本向量相似度和中文关键词匹配，返回图片路径、标签和相似度。",
      inputSchema: SearchImagesInput,
    },
    async (args) => {
      try {
        const input = args as SearchImagesArgs;
        const store = await getStore();
        const hits = await store.search(input.query, input.limit ?? 8, { category: input.category });
        const payload: SearchImagesPayload = {
          query: input.query,
          mode: "hybrid",
          count: hits.length,
          results: hits.map(serializeHit),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
          structuredContent: payload,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `图片检索失败：${message}` }],
        };
      }
    },
  );

  return server;
}

async function closeStore(): Promise<void> {
  const store = await storePromise?.catch(() => null);
  storePromise = null;
  store?.close();
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.once("SIGINT", () => {
    void closeStore().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void closeStore().finally(() => process.exit(0));
  });

  await server.connect(transport);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("IMGM MCP server 启动失败:", error);
    process.exitCode = 1;
  });
}
