type CopyWebImageResult = {
  success: boolean;
  error?: string;
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
};

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}

export {};
