import { contextBridge, ipcRenderer } from "electron";
import { Notyf } from "notyf";
import type { AppSettings, LlmProviderSettings } from "./types/app-settings";
import type { SearchHistoryEntry, SearchHistoryState } from "./types/search-history";

type CopyWebImageResult = {
  success: boolean;
  animated?: boolean;
  clipboardMode?: "file" | "html" | "image";
  error?: string;
};

type GalleryMode = "local" | "rir";

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

const GALLERY_STORAGE = {
  local: { imageList: "localImgList", page: "localPage", pageSize: 8 },
  rir: { imageList: "rirImgList", page: "rirPage", pageSize: 12 },
} as const;

contextBridge.exposeInMainWorld("electron", {
  clipboard: {
    copyWebImage: async (url: string): Promise<CopyWebImageResult> => {
      return ipcRenderer.invoke("copyRirImage", url);
    },
  },
  ipcRenderer: {
    send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (...args: unknown[]) => void) =>
      ipcRenderer.on(channel, (_event, ...args) => func(...args)),
  },
  openDirectory: () => ipcRenderer.invoke("openDirectory"),
  scanDir: (dirPath: string) => ipcRenderer.invoke("scanDir", dirPath),
  checkDir: (dirPath: string) => ipcRenderer.invoke("checkDir", dirPath),
  scanImageIndexGroups: (rootPath: string) => ipcRenderer.invoke("scanImageIndexGroups", rootPath),
  applyImageIndexSelection: (payload: { rootPath: string; selectedPaths: string[] }) => ipcRenderer.invoke("applyImageIndexSelection", payload),
  onImageIndexProgress: (callback: (progress: ImageIndexProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ImageIndexProgress): void => callback(progress);
    ipcRenderer.on("imageIndexProgress", listener);
    return () => ipcRenderer.removeListener("imageIndexProgress", listener);
  },
  getSearchHistory: (): Promise<SearchHistoryState> => ipcRenderer.invoke("getSearchHistory"),
  appendSearchHistory: (entry: SearchHistoryEntry): Promise<SearchHistoryState> => ipcRenderer.invoke("appendSearchHistory", entry),
  moveSearchHistory: (delta: -1 | 1): Promise<SearchHistoryState> => ipcRenderer.invoke("moveSearchHistory", delta),
  activateLatestDirectorySearch: (): Promise<SearchHistoryState> => ipcRenderer.invoke("activateLatestDirectorySearch"),
  getData: (key: string) => ipcRenderer.invoke("getData", key),
  setData: (key: string, data: unknown) => ipcRenderer.invoke("setData", key, data),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("getSettings"),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("saveSettings", settings),
  testLlmConnection: (provider: LlmProviderSettings): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke("testLlmConnection", provider),
  refresh: (showNotice = true) => {
    refreshPage();
    if (showNotice) {
      showMessage("success", "刷新当前浏览");
    }
  },
  sendMsg: (msg: string) => ipcRenderer.send("message", msg),
  showMessage: (type: string, msg: string) => {
    showMessage(type, msg);
  },
  getUser: async () => {
    const userInfo = await ipcRenderer.invoke("getUserInfo");
    showMessage("success", `当前用户：${String((userInfo as any)?.username || "")}`);
    return userInfo;
  },
  getCache: async () => {
    const store = await ipcRenderer.invoke("getAllStore");
    return store;
  },
  ai: {
    ask: (request: unknown) => ipcRenderer.invoke("aiAsk", request),
    onEvent: (callback: (event: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chatEvent: unknown): void => callback(chatEvent);
      ipcRenderer.on("aiChatEvent", listener);
      return () => ipcRenderer.removeListener("aiChatEvent", listener);
    },
  },
});

/** 使用 Notyf 显示统一的成功或错误消息。 */
function showMessage(type: string, msg: string): void {
  const notyf = new Notyf({
    duration: 1500,
    position: { x: "center", y: "top" },
    ripple: true,
  });

  if (type === "success") {
    notyf.success(msg);
  } else if (type === "error" || type === "warn") {
    notyf.error(msg);
  } else {
    notyf.error("未知消息类型！");
  }
}

/** 根据缓存页码刷新主图片区域。 */
async function refreshPage(): Promise<void> {
  const mode = await getGalleryMode();
  const storage = GALLERY_STORAGE[mode];
  const imgList = (await ipcRenderer.invoke("getData", storage.imageList)) as string[];
  const currentPage = (await ipcRenderer.invoke("getData", storage.page)) as number;

  const pageOfImages = getImageList(imgList || [], currentPage || 1, storage.pageSize);
  setImgUrl(pageOfImages, storage.pageSize);
}

/** 获取当前展示模块，缺省时使用本地图片库。 */
async function getGalleryMode(): Promise<GalleryMode> {
  const mode = await ipcRenderer.invoke("getData", "mode");
  return mode === "rir" ? "rir" : "local";
}

/** 从完整图片列表中截取当前页数据。 */
function getImageList(imgList: string[], currentPage: number, pageSize: number): string[] {
  const left = pageSize * (currentPage - 1);
  const right = Math.min(left + pageSize, imgList.length);
  const pageOfImages = imgList.slice(left, right);

  if (!pageOfImages || pageOfImages.length === 0) {
    return [];
  }

  return pageOfImages;
}

/** 把当前页图片绑定到当前模块的展示槽位。 */
function setImgUrl(pageOfImages: string[], pageSize: number): void {
  const itemElements = document.querySelectorAll<HTMLElement>(".grid-img .img-item");
  const imgElements = document.querySelectorAll<HTMLImageElement>(".grid-img .img-item img");
  const copyElements = document.querySelectorAll<HTMLButtonElement>(".grid-img .copy-btn");

  for (let i = 0; i < imgElements.length; i += 1) {
    const itemElement = itemElements[i];
    const copyElement = copyElements[i];
    const isVisibleSlot = i < pageSize;
    if (itemElement) {
      itemElement.hidden = !isVisibleSlot;
    }

    if (isVisibleSlot && i < pageOfImages.length) {
      imgElements[i].src = pageOfImages[i];
      if (copyElement) {
        copyElement.disabled = false;
        copyElement.hidden = false;
      }
    } else {
      imgElements[i].src = "./public/img/404.png";
      if (copyElement) {
        copyElement.disabled = true;
        copyElement.hidden = true;
      }
    }
  }
}
