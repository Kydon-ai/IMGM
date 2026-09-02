import { contextBridge, ipcRenderer } from "electron";
import { Notyf } from "notyf";

type CopyWebImageResult = {
  success: boolean;
  animated?: boolean;
  clipboardMode?: "file" | "html" | "image";
  error?: string;
};

type GalleryMode = "local" | "rir";

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
  getData: (key: string) => ipcRenderer.invoke("getData", key),
  setData: (key: string, data: unknown) => ipcRenderer.invoke("setData", key, data),
  refresh: () => {
    refreshPage();
    showMessage("success", "刷新当前浏览");
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
  openRenameModel: async (datas: { src: string }) => {
    const msg = await ipcRenderer.invoke("openRenameModel", datas);
    return msg;
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
  setImgUrl(pageOfImages, mode, storage.pageSize);
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
function setImgUrl(pageOfImages: string[], mode: GalleryMode, pageSize: number): void {
  const itemElements = document.querySelectorAll<HTMLElement>(".grid-img .img-item");
  const imgElements = document.querySelectorAll<HTMLImageElement>(".grid-img .img-item img");
  const copyElements = document.querySelectorAll<HTMLButtonElement>(".grid-img .copy-btn");
  const renameElements = document.querySelectorAll<HTMLButtonElement>(".grid-img .rename-btn");

  for (let i = 0; i < imgElements.length; i += 1) {
    const itemElement = itemElements[i];
    const copyElement = copyElements[i];
    const renameElement = renameElements[i];
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
      if (renameElement) {
        renameElement.disabled = mode !== "local";
        renameElement.hidden = mode !== "local";
      }
    } else {
      imgElements[i].src = "./public/img/404.png";
      if (copyElement) {
        copyElement.disabled = true;
        copyElement.hidden = true;
      }
      if (renameElement) {
        renameElement.disabled = true;
        renameElement.hidden = true;
      }
    }
  }
}
