export type DatasetSplit = "train" | "test";

export type ImageAspect = "横图" | "竖图" | "方图" | "未知";

export type MetadataStatus = "ok" | "partial";

export type ImageMetadata = {
  id: string;
  filePath: string;
  relativePath: string;
  fileName: string;
  category: string;
  subcategories: string[];
  format: string;
  width: number;
  height: number;
  aspect: ImageAspect;
  sizeBytes: number;
  animated: boolean;
  transparent: boolean;
  dominantColor: string;
  dominantHex: string;
  tags: string[];
  searchText: string;
  split: DatasetSplit;
  status: MetadataStatus;
  error?: string;
};

export type DatasetSummary = {
  rootPath: string;
  generatedAt: string;
  total: number;
  train: number;
  test: number;
  partial: number;
  categories: Record<string, { total: number; train: number; test: number }>;
};

export type ImageSearchHit = {
  id: string;
  filePath: string;
  fileName: string;
  category: string;
  tags: string[];
  description: string;
  score: number;
};

export type SearchIntent = {
  shouldSearch: boolean;
  query: string;
  category?: string;
  color?: string;
  animated?: boolean;
  transparent?: boolean;
};

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiChatRequest = {
  requestId: string;
  threadId: string;
  message: string;
  history: ChatHistoryMessage[];
};

export type AiChatEvent = {
  requestId: string;
  type: "status" | "chunk" | "images" | "error" | "done";
  message?: string;
  chunk?: string;
  images?: ImageSearchHit[];
};

export type AiChatResponse = {
  requestId: string;
  answer: string;
  images: ImageSearchHit[];
};
