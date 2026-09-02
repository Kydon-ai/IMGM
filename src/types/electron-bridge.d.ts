type CopyWebImageResult = {
  success: boolean;
  animated?: boolean;
  clipboardMode?: "file" | "html" | "image";
  error?: string;
};

type AiSearchHit = {
  id: string;
  filePath: string;
  url: string;
  fileName: string;
  category: string;
  tags: string[];
  description: string;
  score: number;
};

type AiChatEventPayload = {
  requestId: string;
  type: "status" | "chunk" | "images" | "error" | "done";
  message?: string;
  chunk?: string;
  images?: AiSearchHit[];
};

type AiChatResponsePayload = {
  requestId: string;
  answer: string;
  images: AiSearchHit[];
};

type ImageIndexItem = {
  filePath: string;
  fileName: string;
  fileUrl: string;
  indexed: boolean;
};

type ImageIndexGroup = {
  directoryPath: string;
  images: ImageIndexItem[];
};

type ImageIndexProgress = {
  phase: "starting" | "processing" | "completed" | "error";
  currentPath?: string;
  completed: number;
  total: number;
  added: number;
  removed: number;
  unchanged: number;
  message?: string;
};

type SearchHistorySource = "directory" | "ai";

type SearchHistoryEntry = {
  source: SearchHistorySource;
  label: string;
  images: string[];
  createdAt: number;
};

type SearchHistoryState = {
  entries: SearchHistoryEntry[];
  pointer: number;
};

type ElectronBridge = {
  clipboard: {
    copyWebImage: (url: string) => Promise<CopyWebImageResult>;
  };
  ipcRenderer: {
    send: (channel: string, data?: unknown) => void;
    on: (channel: string, func: (...args: unknown[]) => void) => void;
  };
  openDirectory: () => Promise<string[]>;
  scanDir: (dirPath: string) => Promise<string[]>;
  checkDir: (dirPath: string) => Promise<boolean>;
  scanImageIndexGroups: (rootPath: string) => Promise<ImageIndexGroup[]>;
  applyImageIndexSelection: (payload: { rootPath: string; selectedPaths: string[] }) => Promise<{ added: number; removed: number; unchanged: number }>;
  onImageIndexProgress: (callback: (progress: ImageIndexProgress) => void) => () => void;
  getSearchHistory: () => Promise<SearchHistoryState>;
  appendSearchHistory: (entry: SearchHistoryEntry) => Promise<SearchHistoryState>;
  moveSearchHistory: (delta: -1 | 1) => Promise<SearchHistoryState>;
  activateLatestDirectorySearch: () => Promise<SearchHistoryState>;
  getData: <T = unknown>(key: string) => Promise<T>;
  setData: (key: string, data: unknown) => Promise<void>;
  refresh: (showNotice?: boolean) => void;
  sendMsg: (msg: string) => void;
  showMessage: (type: string, msg: string) => void;
  getUser: () => Promise<{ username: string; [key: string]: unknown }>;
  getCache: () => Promise<Record<string, unknown>>;
  ai: {
    ask: (request: {
      requestId: string;
      threadId: string;
      message: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    }) => Promise<AiChatResponsePayload>;
    onEvent: (callback: (event: AiChatEventPayload) => void) => () => void;
  };
};

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}

export {};
