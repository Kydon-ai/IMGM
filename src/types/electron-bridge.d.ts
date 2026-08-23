type CopyWebImageResult = {
  success: boolean;
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
  getData: <T = unknown>(key: string) => Promise<T>;
  setData: (key: string, data: unknown) => Promise<void>;
  refresh: () => void;
  sendMsg: (msg: string) => void;
  showMessage: (type: string, msg: string) => void;
  getUser: () => Promise<{ username: string; [key: string]: unknown }>;
  getCache: () => Promise<Record<string, unknown>>;
  openRenameModel: (datas: { src: string }) => Promise<string>;
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
